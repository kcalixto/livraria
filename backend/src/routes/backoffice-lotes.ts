import { Hono } from 'hono';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../lib/db';
import { DEFAULT_REGION } from '../lib/constants';
import { computeStock } from '../lib/stock';
import { jwtMiddleware } from '../middlewares/jwt';

interface LoteBookInput {
  book_id: string;
  amount: number;
}

function parseBooks(books: unknown): LoteBookInput[] | null {
  if (!Array.isArray(books) || books.length === 0) return null;
  const parsed: LoteBookInput[] = [];
  for (const book of books) {
    const bookId = (book as LoteBookInput)?.book_id;
    const amount = (book as LoteBookInput)?.amount;
    if (typeof bookId !== 'string' || bookId === '') return null;
    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 1) return null;
    parsed.push({ book_id: bookId, amount });
  }
  return parsed;
}

export const backofficeLotes = new Hono();

backofficeLotes.use('*', jwtMiddleware);

backofficeLotes.post('/', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'invalid json' }, 400);

  if (typeof body.date !== 'string' || body.date.trim() === '') {
    return c.json({ error: 'date is required' }, 400);
  }
  if (typeof body.region !== 'string' || body.region.trim() === '') {
    return c.json({ error: 'region is required' }, 400);
  }
  const books = parseBooks(body.books);
  if (!books) {
    return c.json(
      { error: 'books must be a non-empty list with book_id and integer amount >= 1' },
      400,
    );
  }
  if (
    typeof body.total_cost !== 'number' ||
    !Number.isInteger(body.total_cost) ||
    body.total_cost < 0
  ) {
    return c.json({ error: 'total_cost must be a non-negative integer (cents)' }, 400);
  }

  const now = new Date().toISOString();
  const lote = {
    id: crypto.randomUUID(),
    date: body.date,
    region: body.region,
    books,
    total_cost: body.total_cost,
    created_at: now,
    updated_at: now,
  };

  await docClient.send(
    new PutCommand({ TableName: process.env.LOTES_TABLE_NAME, Item: lote }),
  );
  return c.json(lote, 201);
});

backofficeLotes.get('/', async (c) => {
  const region = c.req.query('region') ?? DEFAULT_REGION;
  const stock = await computeStock(region);

  const lotes = [...stock.fifo]
    .sort((a, b) => String(b.date).localeCompare(String(a.date))) // listagem: mais novo primeiro
    .map((lote) => ({
      ...lote,
      total_books: lote.books.reduce((sum, b) => sum + b.amount, 0),
      sold_value: stock.lotes[lote.id]?.sold_value ?? 0,
    }));
  return c.json(lotes);
});

backofficeLotes.get('/:id', async (c) => {
  const region = c.req.query('region') ?? DEFAULT_REGION;
  const stock = await computeStock(region);

  const lote = stock.fifo.find((l) => l.id === c.req.param('id'));
  if (!lote) return c.json({ error: 'not found' }, 404);

  const loteStock = stock.lotes[lote.id];
  return c.json({
    ...lote,
    sold_value: loteStock.sold_value,
    books: lote.books.map(({ book_id }) => ({
      book_id,
      ...loteStock.books[book_id],
    })),
  });
});
