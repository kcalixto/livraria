import { Hono } from 'hono';
import { DEFAULT_REGION } from '../lib/constants';
import { computeStock } from '../lib/stock';
import { jwtMiddleware } from '../middlewares/jwt';

export const backofficeEstoque = new Hono();

backofficeEstoque.use('*', jwtMiddleware);

backofficeEstoque.get('/', async (c) => {
  const region = c.req.query('region') ?? DEFAULT_REGION;
  const stock = await computeStock(region);

  const rows = Object.entries(stock.titles).map(([book_id, s]) => ({ book_id, ...s }));
  return c.json(rows);
});
