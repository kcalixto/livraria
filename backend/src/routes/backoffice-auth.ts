import { Hono } from 'hono';
import { sign } from 'hono/jwt';

const TOKEN_TTL_SECONDS = 3600;

export const backofficeAuth = new Hono();

backofficeAuth.post('/', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.password) return c.json({ error: 'password is required' }, 400);

  if (body.password !== process.env.BACKOFFICE_KEY) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  const token = await sign(
    { role: 'admin', exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS },
    process.env.JWT_SECRET!,
    'HS256',
  );
  return c.json({ token });
});
