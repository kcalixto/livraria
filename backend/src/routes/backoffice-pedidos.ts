import { Hono } from 'hono';
import { QueryCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../lib/db';
import { isOrderStatus } from '../lib/order-status';
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
  'updated_at',
] as const;

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
  if (!isOrderStatus(body?.status)) {
    return c.json({ error: 'status must be a valid order status' }, 400);
  }
  if (typeof body.unit_id !== 'string' || body.unit_id === '') {
    return c.json({ error: 'unit_id is required' }, 400);
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

  await docClient.send(
    new UpdateCommand({
      TableName: process.env.PEDIDOS_TABLE_NAME,
      Key: { id, book_id: line.book_id },
      UpdateExpression: 'SET #status = :status, updated_at = :updated_at',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': body.status,
        ':updated_at': new Date().toISOString(),
      },
    }),
  );

  return c.json({ id, unit_id: body.unit_id, status: body.status });
});
