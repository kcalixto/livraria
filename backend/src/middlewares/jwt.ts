import { createMiddleware } from 'hono/factory';
import { verify } from 'hono/jwt';

export const jwtMiddleware = createMiddleware(async (c, next) => {
  const auth = c.req.header('authorization');
  if (!auth?.startsWith('Bearer ')) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  try {
    await verify(auth.slice('Bearer '.length), process.env.JWT_SECRET!, 'HS256');
  } catch {
    return c.json({ error: 'unauthorized' }, 401);
  }
  await next();
});
