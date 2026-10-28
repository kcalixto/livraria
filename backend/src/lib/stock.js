import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from './db';
const SOLD_STATUSES = new Set(['payment-received', 'sent-to-delivery', 'received']);
// Regras de dedução (CLAUDE.md): reserva e retirado-sem-pagamento seguram a
// unidade; pago/entregue é venda. Waiting sem retirada NÃO sai do available
// (senão confirmar o pagamento falharia por falta de estoque) — conta como
// "committed", que só a vitrine desconta.
export function classifyUnit(unit) {
    const status = String(unit.status ?? '');
    if (status === 'cancelled')
        return 'none'; // cancelada devolve ao lote
    if (SOLD_STATUSES.has(status))
        return 'sold';
    if (unit.picked_up === true)
        return 'picked_up';
    if (status === 'in-reserve')
        return 'reserved';
    if (status === 'waiting-payment')
        return 'committed';
    return 'none';
}
export async function computeStock(region) {
    const [lotesResult, pedidosResult] = await Promise.all([
        docClient.send(new ScanCommand({ TableName: process.env.LOTES_TABLE_NAME })),
        docClient.send(new ScanCommand({ TableName: process.env.PEDIDOS_TABLE_NAME })),
    ]);
    const fifo = (lotesResult.Items ?? [])
        .filter((l) => l.region === region)
        .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const titles = {};
    const lotes = {};
    const titleOf = (bookId) => (titles[bookId] ??= {
        acquired: 0,
        reserved: 0,
        picked_up: 0,
        sold: 0,
        committed: 0,
        available: 0,
        sellable: 0,
    });
    for (const lote of fifo) {
        const loteStock = { books: {}, sold_value: 0 };
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
        if (kind === 'none')
            continue;
        const titleId = String(unit.title_id);
        titleOf(titleId)[kind] += 1;
        // comprometida não consome exemplar de lote: o lote só é alocado quando a
        // unidade avança pra um estado que deduz
        if (kind === 'committed')
            continue;
        const loteId = unit.lote_id;
        if (loteId && lotes[loteId]) {
            const bookStats = lotes[loteId].books[titleId];
            if (bookStats)
                bookStats[kind] += 1;
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
