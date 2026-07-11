import { beforeEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { apiKeyMiddleware } from './api-key';

function buildApp() {
  const app = new Hono();
  app.use('*', apiKeyMiddleware);
  app.get('/protegido', (c) => c.json({ ok: true }));
  return app;
}

beforeEach(() => {
  process.env.LIVRARIA_FRONT_END_API_KEY = 'chave-front';
});

describe('apiKeyMiddleware', () => {
  it('retorna 401 sem header x-api-key', async () => {
    const res = await buildApp().request('/protegido');
    expect(res.status).toBe(401);
  });

  it('retorna 401 com x-api-key incorreta', async () => {
    const res = await buildApp().request('/protegido', {
      headers: { 'x-api-key': 'errada' },
    });
    expect(res.status).toBe(401);
  });

  it('deixa passar com x-api-key correta', async () => {
    const res = await buildApp().request('/protegido', {
      headers: { 'x-api-key': 'chave-front' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
