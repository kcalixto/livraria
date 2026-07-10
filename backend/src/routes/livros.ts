import { Hono } from 'hono';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../lib/db';
import { bookImageUrl } from '../lib/image-url';
import { BOOK_STATUS_AVAILABLE, mockAmount } from '../lib/stock-mock';

export const livros = new Hono();

livros.get('/livros', async (c) => {
  const result = await docClient.send(
    new ScanCommand({ TableName: process.env.LIVROS_TABLE_NAME }),
  );
  const books = (result.Items ?? []).map((item) => ({
    ...item,
    amount: mockAmount(),
    status: BOOK_STATUS_AVAILABLE,
    image_url: bookImageUrl(item.id as string),
  }));
  return c.json(books);
});
