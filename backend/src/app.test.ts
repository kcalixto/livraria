import { describe, expect, it } from 'vitest';
import { app } from './app';

describe('CORS', () => {
  it('responde preflight OPTIONS com headers CORS', async () => {
    const res = await app.request('/pedidos', {
      method: 'OPTIONS',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });

    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBeTruthy();
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
  });

  it('inclui access-control-allow-origin nas respostas normais', async () => {
    const res = await app.request('/backoffice/login', {
      method: 'POST',
      headers: { origin: 'http://localhost:5173', 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.headers.get('access-control-allow-origin')).toBeTruthy();
  });
});
