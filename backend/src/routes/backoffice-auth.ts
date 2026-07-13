import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import type { Role } from '../middlewares/require-role';

const HOUR = 3600;
const DAY = 24 * HOUR;

// perfis segmentados pela senha (sem banco de usuários, por ora):
// admin escreve (token curto); viewer/stock só leem (token de 24h)
const PROFILES: Array<{ env: string; role: Role; ttl: number }> = [
  { env: 'BACKOFFICE_KEY', role: 'admin', ttl: HOUR },
  { env: 'BACKOFFICE_VIEWER_KEY', role: 'viewer', ttl: DAY },
  { env: 'BACKOFFICE_STOCK_KEY', role: 'stock', ttl: DAY },
];

export const backofficeAuth = new Hono();

backofficeAuth.post('/', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.password) return c.json({ error: 'password is required' }, 400);

  // env ausente nunca casa (role desativado no ambiente)
  const profile = PROFILES.find(
    ({ env }) => process.env[env] !== undefined && body.password === process.env[env],
  );
  if (!profile) return c.json({ error: 'unauthorized' }, 401);

  const token = await sign(
    { role: profile.role, exp: Math.floor(Date.now() / 1000) + profile.ttl },
    process.env.JWT_SECRET!,
    'HS256',
  );
  return c.json({ token, role: profile.role });
});
