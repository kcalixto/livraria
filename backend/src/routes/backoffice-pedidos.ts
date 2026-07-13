import { Hono } from 'hono';
import { QueryCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../lib/db';
import { isOrderStatus } from '../lib/order-status';
import type { OrderStatus } from '../lib/order-status';
import { computeStock } from '../lib/stock';
import { jwtMiddleware } from '../middlewares/jwt';

// campos do agrupador (iguais em todas as linhas do pedido)
const ORDER_FIELDS = ['name', 'contact', 'region', 'created_at'] as const;
// campos por unidade
const UNIT_FIELDS = [
  'unit_id',
  'title_id',
  'status',
  'lote_id',
  'received_amount',
  'picked_up',
  'paid_at',
  'updated_at',
] as const;

// Matriz de transições (CLAUDE.md). Reversas existem porque erro humano
// acontece: liberar reserva e desfazer retirado devolvem a unidade ao lote.
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  'waiting-payment': ['in-reserve', 'payment-received'],
  'in-reserve': ['waiting-payment', 'payment-received'],
  'payment-received': ['sent-to-delivery'],
  'sent-to-delivery': ['received'],
  received: [],
};
const PICKED_UP_TRANSITIONS: Record<string, OrderStatus[]> = {
  'waiting-payment': ['payment-received'],
};

// FIFO: lote mais antigo da região com unidade livre do título
async function allocateLote(unit: Record<string, unknown>): Promise<string | null> {
  const stock = await computeStock(String(unit.region));
  const titleId = String(unit.title_id);
  for (const lote of stock.fifo) {
    if ((stock.lotes[lote.id]?.books[titleId]?.remaining ?? 0) > 0) return lote.id;
  }
  return null;
}

interface UpdateSpec {
  sets: Record<string, unknown>;
  removes: string[];
}

async function applyUpdate(id: string, bookKey: unknown, spec: UpdateSpec) {
  const sets = { ...spec.sets, updated_at: new Date().toISOString() };
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const setParts = Object.entries(sets).map(([field, value]) => {
    names[`#${field}`] = field;
    values[`:${field}`] = value;
    return `#${field} = :${field}`;
  });
  const removeParts = spec.removes.map((field) => {
    names[`#${field}`] = field;
    return `#${field}`;
  });

  let expression = `SET ${setParts.join(', ')}`;
  if (removeParts.length > 0) expression += ` REMOVE ${removeParts.join(', ')}`;

  await docClient.send(
    new UpdateCommand({
      TableName: process.env.PEDIDOS_TABLE_NAME,
      Key: { id, book_id: bookKey },
      UpdateExpression: expression,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  );
}

export const backofficePedidos = new Hono();

backofficePedidos.use('*', jwtMiddleware);

backofficePedidos.get('/', async (c) => {
  const result = await docClient.send(
    new ScanCommand({ TableName: process.env.PEDIDOS_TABLE_NAME }),
  );
  const lines: Record<string, unknown>[] = result.Items ?? [];

  const byId = new Map<string, Record<string, unknown> & { items: unknown[] }>();
  for (const line of lines) {
    const id = line.id as string;
    let order = byId.get(id);
    if (!order) {
      order = { id, items: [] };
      for (const f of ORDER_FIELDS) order[f] = line[f];
      byId.set(id, order);
    }
    const item: Record<string, unknown> = {};
    for (const f of UNIT_FIELDS) {
      if (line[f] !== undefined) item[f] = line[f];
    }
    order.items.push(item);
  }

  const orders = [...byId.values()].sort((a, b) =>
    String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')),
  );
  return c.json(orders);
});

backofficePedidos.patch('/:id/status', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'invalid json' }, 400);
  if (typeof body.unit_id !== 'string' || body.unit_id === '') {
    return c.json({ error: 'unit_id is required' }, 400);
  }

  const isPickupToggle = typeof body.picked_up === 'boolean';
  if (!isPickupToggle && !isOrderStatus(body.status)) {
    return c.json({ error: 'status must be a valid order status' }, 400);
  }

  const id = c.req.param('id');
  const existing = await docClient.send(
    new QueryCommand({
      TableName: process.env.PEDIDOS_TABLE_NAME,
      KeyConditionExpression: 'id = :id',
      ExpressionAttributeValues: { ':id': id },
    }),
  );
  const line = (existing.Items ?? []).find((item) => item.unit_id === body.unit_id);
  if (!line) return c.json({ error: 'not found' }, 404);

  const current = String(line.status) as OrderStatus;

  if (isPickupToggle) {
    if (body.picked_up === true) {
      if (line.picked_up === true || !['waiting-payment', 'in-reserve'].includes(current)) {
        return c.json({ error: 'unit cannot be marked as picked up from this state' }, 400);
      }
      const spec: UpdateSpec = { sets: { picked_up: true, status: 'waiting-payment' }, removes: [] };
      if (!line.lote_id) {
        const loteId = await allocateLote(line);
        if (!loteId) {
          return c.json({ error: 'no available stock in region to allocate this unit' }, 400);
        }
        spec.sets.lote_id = loteId;
      }
      await applyUpdate(id, line.book_id, spec);
      return c.json({ id, unit_id: body.unit_id, picked_up: true, status: 'waiting-payment' });
    }

    // desfazer retirado: só antes do pagamento; devolve a unidade ao lote
    if (line.picked_up !== true || current !== 'waiting-payment') {
      return c.json({ error: 'picked up can only be undone before payment' }, 400);
    }
    await applyUpdate(id, line.book_id, {
      sets: { status: 'waiting-payment' },
      removes: ['picked_up', 'lote_id'],
    });
    return c.json({ id, unit_id: body.unit_id, picked_up: false, status: 'waiting-payment' });
  }

  const target = body.status as OrderStatus;
  const allowed =
    line.picked_up === true
      ? (PICKED_UP_TRANSITIONS[current] ?? [])
      : TRANSITIONS[current];
  if (!allowed.includes(target)) {
    return c.json({ error: `invalid transition: ${current} -> ${target}` }, 400);
  }

  const spec: UpdateSpec = { sets: { status: target }, removes: [] };

  if (target === 'payment-received') {
    if (
      typeof body.received_amount !== 'number' ||
      !Number.isInteger(body.received_amount) ||
      body.received_amount < 0
    ) {
      return c.json(
        { error: 'received_amount (non-negative integer, cents) is required' },
        400,
      );
    }
    spec.sets.received_amount = body.received_amount;
    spec.sets.paid_at = new Date().toISOString(); // data do pagamento (relatórios)
  }

  // entrada em estado que deduz estoque, ainda sem lote → aloca FIFO
  const entersDeducting = target === 'in-reserve' || target === 'payment-received';
  if (entersDeducting && !line.lote_id) {
    const loteId = await allocateLote(line);
    if (!loteId) {
      return c.json({ error: 'no available stock in region to allocate this unit' }, 400);
    }
    spec.sets.lote_id = loteId;
  }

  // liberar reserva devolve a unidade ao lote
  if (current === 'in-reserve' && target === 'waiting-payment') {
    spec.removes.push('lote_id');
  }

  await applyUpdate(id, line.book_id, spec);
  return c.json({ id, unit_id: body.unit_id, status: target });
});
