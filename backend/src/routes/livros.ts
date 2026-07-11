import { Hono } from 'hono';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../lib/db';
import { BOOK_STATUS_AVAILABLE, mockAmount } from '../lib/stock-mock';

export const livros = new Hono();

livros.get('/livros', async (c) => {
  const result = await docClient.send(
    new ScanCommand({ TableName: process.env.LIVROS_TABLE_NAME }),
  );
  // capa não vem da API: o front resolve /images/<id>.jpg servido junto do site
  const items: Record<string, unknown>[] = result.Items ?? [];
  const books = items
    .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
    .map((item) => ({
      ...item,
      amount: mockAmount(),
      status: BOOK_STATUS_AVAILABLE,
    }));
  return c.json(books);
});
