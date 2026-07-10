import { createMiddleware } from 'hono/factory';

export const apiKeyMiddleware = createMiddleware(async (c, next) => {
  const key = c.req.header('x-api-key');
  if (!key || key !== process.env.LIVRARIA_BACKOFFICE_API_KEY) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  await next();
});
