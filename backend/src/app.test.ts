import { beforeEach, describe, expect, it } from 'vitest';
import { app } from './app';

beforeEach(() => {
  process.env.LIVRARIA_FRONT_END_API_KEY = 'chave-front';
});

describe('api key global', () => {
  it('rota pública sem x-api-key retorna 401', async () => {
    const res = await app.request('/livros');
    expect(res.status).toBe(401);
  });

  it('login sem x-api-key retorna 401', async () => {
    const res = await app.request('/backoffice/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'x' }),
    });
    expect(res.status).toBe(401);
  });
});

describe('CORS', () => {
  it('responde preflight OPTIONS com headers CORS SEM exigir api key', async () => {
    const res = await app.request('/pedidos', {
      method: 'OPTIONS',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type,x-api-key',
      },
    });

    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBeTruthy();
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
  });

  it('inclui access-control-allow-origin nas respostas normais', async () => {
    const res = await app.request('/backoffice/login', {
      method: 'POST',
      headers: {
        origin: 'http://localhost:5173',
        'content-type': 'application/json',
        'x-api-key': 'chave-front',
      },
      body: JSON.stringify({}),
    });

    expect(res.headers.get('access-control-allow-origin')).toBeTruthy();
  });
});
