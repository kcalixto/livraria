import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from './db';

export interface TitleStock {
  acquired: number;
  reserved: number;
  picked_up: number;
  sold: number;
  available: number;
}

export interface LoteBookStats {
  acquired: number;
  reserved: number;
  picked_up: number;
  sold: number;
  remaining: number;
}

export interface LoteStock {
  books: Record<string, LoteBookStats>;
  sold_value: number; // Σ received_amount das unidades pagas deste lote
}

export interface Lote {
  id: string;
  date: string;
  region: string;
  books: Array<{ book_id: string; amount: number }>;
  total_cost: number;
  [key: string]: unknown;
}

export interface Stock {
  titles: Record<string, TitleStock>;
  lotes: Record<string, LoteStock>;
  // lotes da região ordenados por data crescente (alocação FIFO)
  fifo: Lote[];
}

type UnitClass = 'sold' | 'reserved' | 'picked_up' | 'none';

const SOLD_STATUSES = new Set(['payment-received', 'sent-to-delivery', 'received']);

// Regras de dedução (CLAUDE.md): waiting sem retirada não deduz; reserva e
// retirado-sem-pagamento seguram a unidade; pago/entregue é venda.
export function classifyUnit(unit: Record<string, unknown>): UnitClass {
  const status = String(unit.status ?? '');
  if (status === 'cancelled') return 'none'; // cancelada devolve ao lote
  if (SOLD_STATUSES.has(status)) return 'sold';
  if (unit.picked_up === true) return 'picked_up';
  if (status === 'in-reserve') return 'reserved';
  return 'none';
}

export async function computeStock(region: string): Promise<Stock> {
  const [lotesResult, pedidosResult] = await Promise.all([
    docClient.send(new ScanCommand({ TableName: process.env.LOTES_TABLE_NAME })),
    docClient.send(new ScanCommand({ TableName: process.env.PEDIDOS_TABLE_NAME })),
  ]);

  const fifo = ((lotesResult.Items ?? []) as Lote[])
    .filter((l) => l.region === region)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const titles: Record<string, TitleStock> = {};
  const lotes: Record<string, LoteStock> = {};

  const titleOf = (bookId: string): TitleStock =>
    (titles[bookId] ??= { acquired: 0, reserved: 0, picked_up: 0, sold: 0, available: 0 });

  for (const lote of fifo) {
    const loteStock: LoteStock = { books: {}, sold_value: 0 };
    lotes[lote.id] = loteStock;
    for (const { book_id, amount } of lote.books) {
      titleOf(book_id).acquired += amount;
      loteStock.books[book_id] ??= {
        acquired: 0,
        reserved: 0,
        picked_up: 0,
        sold: 0,
        remaining: 0,
      };
      loteStock.books[book_id].acquired += amount;
    }
  }

  const units = (pedidosResult.Items ?? []).filter((u) => u.region === region);
  for (const unit of units) {
    const kind = classifyUnit(unit);
    if (kind === 'none') continue;

    const titleId = String(unit.title_id);
    titleOf(titleId)[kind] += 1;

    const loteId = unit.lote_id as string | undefined;
    if (loteId && lotes[loteId]) {
      const bookStats = lotes[loteId].books[titleId];
      if (bookStats) bookStats[kind] += 1;
      if (kind === 'sold' && typeof unit.received_amount === 'number') {
        lotes[loteId].sold_value += unit.received_amount;
      }
    }
  }

  for (const stock of Object.values(titles)) {
    stock.available = stock.acquired - stock.reserved - stock.picked_up - stock.sold;
  }
  for (const lote of Object.values(lotes)) {
    for (const stats of Object.values(lote.books)) {
      stats.remaining = stats.acquired - stats.reserved - stats.picked_up - stats.sold;
    }
  }

  return { titles, lotes, fifo };
}
