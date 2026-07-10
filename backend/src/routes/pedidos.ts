import { Hono } from 'hono';
import { BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../lib/db';
import { ORDER_STATUS_WAITING_PAYMENT } from '../lib/order-status';

const MAX_ITEMS = 25; // limite do BatchWrite do DynamoDB

interface OrderItemInput {
  book_id: string;
  amount: number;
}

function parseItems(items: unknown): OrderItemInput[] | null {
  if (!Array.isArray(items) || items.length === 0) return null;
  const byBook = new Map<string, number>();
  for (const item of items) {
    const bookId = (item as OrderItemInput)?.book_id;
    const amount = (item as OrderItemInput)?.amount;
    if (typeof bookId !== 'string' || bookId === '') return null;
    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 1) return null;
    byBook.set(bookId, (byBook.get(bookId) ?? 0) + amount);
  }
  if (byBook.size > MAX_ITEMS) return null;
  return [...byBook.entries()].map(([book_id, amount]) => ({ book_id, amount }));
}

export const pedidos = new Hono();

pedidos.post('/', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'invalid json' }, 400);

  for (const field of ['name', 'contact', 'region'] as const) {
    if (typeof body[field] !== 'string' || body[field].trim() === '') {
      return c.json({ error: `${field} is required` }, 400);
    }
  }
  const items = parseItems(body.items);
  if (!items) {
    return c.json(
      { error: `items must have 1-${MAX_ITEMS} entries with book_id and integer amount >= 1` },
      400,
    );
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const puts = items.map(({ book_id, amount }) => ({
    PutRequest: {
      Item: {
        id,
        book_id,
        amount,
        name: body.name,
        contact: body.contact,
        region: body.region,
        status: ORDER_STATUS_WAITING_PAYMENT,
        created_at: now,
        updated_at: now,
      },
    },
  }));

  await docClient.send(
    new BatchWriteCommand({
      RequestItems: { [process.env.PEDIDOS_TABLE_NAME!]: puts },
    }),
  );

  return c.json({ id }, 201);
});
