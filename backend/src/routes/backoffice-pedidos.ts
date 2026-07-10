import { Hono } from 'hono';
import { QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../lib/db';
import { isOrderStatus } from '../lib/order-status';
import { jwtMiddleware } from '../middlewares/jwt';

export const backofficePedidos = new Hono();

backofficePedidos.use('*', jwtMiddleware);

backofficePedidos.get('/', async (c) => {
  const status = c.req.query('status');
  if (!isOrderStatus(status)) {
    return c.json({ error: 'status query param must be a valid order status' }, 400);
  }

  const result = await docClient.send(
    new QueryCommand({
      TableName: process.env.PEDIDOS_TABLE_NAME,
      IndexName: 'status-index',
      KeyConditionExpression: '#status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': status },
    }),
  );
  return c.json(result.Items ?? []);
});

backofficePedidos.patch('/:id/status', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!isOrderStatus(body?.status)) {
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
  let items = existing.Items ?? [];
  // book_id opcional: atualiza só aquela linha do pedido (design: status por livro)
  if (body.book_id !== undefined) {
    items = items.filter((item) => item.book_id === body.book_id);
  }
  if (items.length === 0) return c.json({ error: 'not found' }, 404);

  const now = new Date().toISOString();
  await Promise.all(
    items.map((item) =>
      docClient.send(
        new UpdateCommand({
          TableName: process.env.PEDIDOS_TABLE_NAME,
          Key: { id, book_id: item.book_id },
          UpdateExpression: 'SET #status = :status, updated_at = :updated_at',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':status': body.status, ':updated_at': now },
        }),
      ),
    ),
  );

  return c.json({ id, status: body.status });
});
