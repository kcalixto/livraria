import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  apiAuthDelete,
  apiAuthGet,
  apiAuthPatch,
  apiAuthPost,
  apiAuthPut,
  apiGet,
  apiPost,
} from './client';

let fetchMock: ReturnType<typeof vi.fn>;

function headersOf(call: number = 0): Record<string, string> {
  const init = (fetchMock.mock.calls[call][1] ?? {}) as RequestInit;
  return (init.headers ?? {}) as Record<string, string>;
}

beforeEach(() => {
  sessionStorage.setItem('livraria:token', 'jwt-abc');
  fetchMock = vi.fn().mockImplementation(() =>
    Promise.resolve(new Response('{}', { status: 200 })),
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe('client HTTP', () => {
  it('toda chamada leva o header x-api-key (VITE_API_KEY)', async () => {
    await apiGet('/livros');
    await apiPost('/pedidos', {});
    await apiAuthGet('/backoffice/pedidos?status=received');
    await apiAuthPatch('/backoffice/pedidos/p1/status', {});

    for (let i = 0; i < 4; i++) {
      expect(headersOf(i)['x-api-key']).toBe('test-key');
    }
  });

  it('apiAuthPost/Put/Delete levam Bearer + x-api-key e o método certo', async () => {
    await apiAuthPost('/backoffice/livros', { title: 'x' });
    await apiAuthPut('/backoffice/livros/b1', { title: 'y' });
    await apiAuthDelete('/backoffice/livros/b1');

    const methods = fetchMock.mock.calls.map(([, init]) => (init as RequestInit).method);
    expect(methods).toEqual(['POST', 'PUT', 'DELETE']);
    for (let i = 0; i < 3; i++) {
      expect(headersOf(i).authorization).toBe('Bearer jwt-abc');
      expect(headersOf(i)['x-api-key']).toBe('test-key');
    }
  });
});
