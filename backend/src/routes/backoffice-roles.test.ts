import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { sign } from 'hono/jwt';
import { app } from '../app';

const ddbMock = mockClient(DynamoDBDocumentClient);

async function headersFor(role: string): Promise<Record<string, string>> {
  const token = await sign(
    { role, exp: Math.floor(Date.now() / 1000) + 3600 },
    'segredo-jwt-teste',
  );
  return {
    'x-api-key': 'chave-front',
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  };
}

beforeEach(() => {
  ddbMock.reset();
  ddbMock.on(ScanCommand).resolves({ Items: [] });
  ddbMock.on(QueryCommand).resolves({ Items: [] });
  ddbMock.on(PutCommand).resolves({});
  ddbMock.on(UpdateCommand).resolves({});
  process.env.LIVRARIA_FRONT_END_API_KEY = 'chave-front';
  process.env.JWT_SECRET = 'segredo-jwt-teste';
  process.env.PEDIDOS_TABLE_NAME = 'livraria-tb-pedidos-test';
  process.env.LOTES_TABLE_NAME = 'livraria-tb-lotes-test';
  process.env.LIVROS_TABLE_NAME = 'livraria-tb-livros-test';
});

// matriz de escopo por role: leitura fora do escopo (ou escrita sem admin) = 401
describe('segmentação de acesso por role', () => {
  it('stock: só o GET de estoque passa', async () => {
    const headers = await headersFor('stock');

    expect((await app.request('/backoffice/estoque', { headers })).status).toBe(200);
    expect((await app.request('/backoffice/pedidos', { headers })).status).toBe(401);
    expect((await app.request('/backoffice/lotes', { headers })).status).toBe(401);
    const write = await app.request('/backoffice/livros', {
      method: 'POST',
      body: JSON.stringify({ title: 'X', price: 100, social_price: 100 }),
      headers,
    });
    expect(write.status).toBe(401);
  });

  it('viewer: GETs do backoffice passam, escrita não', async () => {
    const headers = await headersFor('viewer');

    expect((await app.request('/backoffice/estoque', { headers })).status).toBe(200);
    expect((await app.request('/backoffice/pedidos', { headers })).status).toBe(200);
    expect((await app.request('/backoffice/lotes', { headers })).status).toBe(200);

    const patch = await app.request('/backoffice/pedidos/PED001/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'in-reserve', unit_id: 'u1' }),
      headers,
    });
    expect(patch.status).toBe(401);

    const loteWrite = await app.request('/backoffice/lotes', {
      method: 'POST',
      body: JSON.stringify({
        date: '2026-07-13',
        region: 'SP, Capital - Zona Sul',
        books: [{ book_id: 'b1', amount: 1 }],
        total_cost: 100,
      }),
      headers,
    });
    expect(loteWrite.status).toBe(401);

    const livroWrite = await app.request('/backoffice/livros/b1', {
      method: 'PUT',
      body: JSON.stringify({ price: 100 }),
      headers,
    });
    expect(livroWrite.status).toBe(401);

    const txWrite = await app.request('/backoffice/lotes/lote-a/transacoes', {
      method: 'POST',
      body: JSON.stringify({ date: '2026-07-13', recipient: 'X', amount: -100 }),
      headers,
    });
    expect(txWrite.status).toBe(401);
  });

  it('admin: leitura e escrita passam', async () => {
    const headers = await headersFor('admin');

    expect((await app.request('/backoffice/estoque', { headers })).status).toBe(200);
    expect((await app.request('/backoffice/pedidos', { headers })).status).toBe(200);

    const write = await app.request('/backoffice/livros', {
      method: 'POST',
      body: JSON.stringify({ title: 'X', price: 100, social_price: 100 }),
      headers,
    });
    expect(write.status).toBe(201);
  });

  it('role desconhecido no token não passa em nada', async () => {
    const headers = await headersFor('hacker');
    expect((await app.request('/backoffice/estoque', { headers })).status).toBe(401);
    expect((await app.request('/backoffice/pedidos', { headers })).status).toBe(401);
  });
});
