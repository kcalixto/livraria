import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from './db';

export interface TitleStock {
  acquired: number;
  reserved: number;
  picked_up: number;
  sold: number;
  committed: number; // em pedido aguardando pagamento (não retirado)
  available: number; // saldo operacional: é ele que a alocação FIFO consome
  sellable: number; // available − committed: o que a loja ainda pode vender
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

type LoteUnitClass = 'sold' | 'reserved' | 'picked_up';
type UnitClass = LoteUnitClass | 'committed' | 'none';

const SOLD_STATUSES = new Set(['payment-received', 'sent-to-delivery', 'received']);

// Regras de dedução (CLAUDE.md): reserva e retirado-sem-pagamento seguram a
// unidade; pago/entregue é venda. Waiting sem retirada NÃO sai do available
// (senão confirmar o pagamento falharia por falta de estoque) — conta como
// "committed", que só a vitrine desconta.
export function classifyUnit(unit: Record<string, unknown>): UnitClass {
  const status = String(unit.status ?? '');
  if (status === 'cancelled') return 'none'; // cancelada devolve ao lote
  if (SOLD_STATUSES.has(status)) return 'sold';
  if (unit.picked_up === true) return 'picked_up';
  if (status === 'in-reserve') return 'reserved';
  if (status === 'waiting-payment') return 'committed';
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
    (titles[bookId] ??= {
      acquired: 0,
      reserved: 0,
      picked_up: 0,
      sold: 0,
      committed: 0,
      available: 0,
      sellable: 0,
    });

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
    // comprometida não consome exemplar de lote: o lote só é alocado quando a
    // unidade avança pra um estado que deduz
    if (kind === 'committed') continue;

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
    // pedido além do estoque é permitido (nunca bloqueamos a criação), então o
    // sellable tem piso em 0 em vez de virar dívida
    stock.sellable = Math.max(0, stock.available - stock.committed);
  }
  for (const lote of Object.values(lotes)) {
    for (const stats of Object.values(lote.books)) {
      stats.remaining = stats.acquired - stats.reserved - stats.picked_up - stats.sold;
    }
  }

  return { titles, lotes, fifo };
}
