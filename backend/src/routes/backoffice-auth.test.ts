import { beforeEach, describe, expect, it } from 'vitest';
import { verify } from 'hono/jwt';
import { app } from '../app';

const JSON_HEADER = { 'content-type': 'application/json', 'x-api-key': 'chave-front' };

beforeEach(() => {
  process.env.LIVRARIA_FRONT_END_API_KEY = 'chave-front';
  process.env.BACKOFFICE_KEY = 'senha-do-backoffice';
  process.env.JWT_SECRET = 'segredo-jwt-teste';
});

describe('POST /backoffice/login', () => {
  it('retorna JWT de 1h com a senha correta', async () => {
    const res = await app.request('/backoffice/login', {
      method: 'POST',
      body: JSON.stringify({ password: 'senha-do-backoffice' }),
      headers: JSON_HEADER,
    });

    expect(res.status).toBe(200);
    const { token } = (await res.json()) as { token: string };
    const payload = await verify(token, 'segredo-jwt-teste', 'HS256');
    expect(payload.role).toBe('admin');
    const ttl = (payload.exp as number) - Math.floor(Date.now() / 1000);
    expect(ttl).toBeGreaterThan(3500);
    expect(ttl).toBeLessThanOrEqual(3600);
  });

  it('retorna 401 com senha errada', async () => {
    const res = await app.request('/backoffice/login', {
      method: 'POST',
      body: JSON.stringify({ password: 'errada' }),
      headers: JSON_HEADER,
    });
    expect(res.status).toBe(401);
  });

  it('retorna 400 sem password no body', async () => {
    const res = await app.request('/backoffice/login', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: JSON_HEADER,
    });
    expect(res.status).toBe(400);
  });

  it('não exige JWT, mas exige a api key global', async () => {
    const res = await app.request('/backoffice/login', {
      method: 'POST',
      body: JSON.stringify({ password: 'senha-do-backoffice' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(401);
  });
});
