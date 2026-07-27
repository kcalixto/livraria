import { Hono } from 'hono';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../lib/db';
import { DEFAULT_REGION } from '../lib/constants';
import { computeStock } from '../lib/stock';

export const livros = new Hono();

livros.get('/livros', async (c) => {
  const region = c.req.query('region') ?? DEFAULT_REGION;
  const [result, stock] = await Promise.all([
    docClient.send(new ScanCommand({ TableName: process.env.LIVROS_TABLE_NAME })),
    computeStock(region),
  ]);

  // capa não vem da API: o front resolve /images/<stage>/<slug>.jpg
  const items: Record<string, unknown>[] = result.Items ?? [];
  const books = items
    .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
    .map((item) => ({
      ...item,
      // o que a vitrine ainda pode vender: desconta reserva/venda/retirada E
      // pedidos aguardando pagamento. Livro sem lote = 0 (esgotado).
      amount: stock.titles[item.id as string]?.sellable ?? 0,
    }));
  return c.json(books);
});
