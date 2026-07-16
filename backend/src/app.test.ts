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

  it('aceita o domínio do CloudFront do site quando SITE_CDN_DOMAIN está setada', async () => {
    process.env.SITE_CDN_DOMAIN = 'd111abc222.cloudfront.net';
    try {
      const res = await app.request('/pedidos', {
        method: 'OPTIONS',
        headers: {
          origin: 'https://d111abc222.cloudfront.net',
          'access-control-request-method': 'POST',
        },
      });
      expect(res.headers.get('access-control-allow-origin')).toBe(
        'https://d111abc222.cloudfront.net',
      );

      // qualquer OUTRA distribuição cloudfront continua barrada
      const outro = await app.request('/pedidos', {
        method: 'OPTIONS',
        headers: {
          origin: 'https://d999xyz888.cloudfront.net',
          'access-control-request-method': 'POST',
        },
      });
      expect(outro.headers.get('access-control-allow-origin')).toBeNull();
    } finally {
      delete process.env.SITE_CDN_DOMAIN;
    }
  });
});
