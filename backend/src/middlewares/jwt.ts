import { createMiddleware } from 'hono/factory';
import { verify } from 'hono/jwt';
import type { Role } from './require-role';

export const jwtMiddleware = createMiddleware(async (c, next) => {
  const auth = c.req.header('authorization');
  if (!auth?.startsWith('Bearer ')) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  try {
    const payload = await verify(auth.slice('Bearer '.length), process.env.JWT_SECRET!, 'HS256');
    // o role alimenta o requireRole das rotas
    c.set('jwtRole', payload.role as Role | undefined);
  } catch {
    return c.json({ error: 'unauthorized' }, 401);
  }
  await next();
});
