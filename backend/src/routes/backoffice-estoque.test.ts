import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { sign } from 'hono/jwt';
import { app } from '../app';

const ddbMock = mockClient(DynamoDBDocumentClient);
const REGION = 'SP, Capital - Zona Sul';

async function authHeaders(): Promise<Record<string, string>> {
  const token = await sign(
    { role: 'admin', exp: Math.floor(Date.now() / 1000) + 3600 },
    'segredo-jwt-teste',
  );
  return { 'x-api-key': 'chave-front', authorization: `Bearer ${token}` };
}

beforeEach(() => {
  ddbMock.reset();
  process.env.LIVRARIA_FRONT_END_API_KEY = 'chave-front';
  process.env.JWT_SECRET = 'segredo-jwt-teste';
  process.env.LOTES_TABLE_NAME = 'livraria-tb-lotes-test';
  process.env.PEDIDOS_TABLE_NAME = 'livraria-tb-pedidos-test';
  ddbMock.on(ScanCommand, { TableName: 'livraria-tb-lotes-test' }).resolves({
    Items: [
      {
        id: 'lote-a',
        date: '2026-07-01',
        region: REGION,
        books: [{ book_id: 'b1', amount: 3 }],
        total_cost: 1000,
      },
    ],
  });
  ddbMock.on(ScanCommand, { TableName: 'livraria-tb-pedidos-test' }).resolves({
    Items: [
      {
        id: 'PED1',
        region: REGION,
        unit_id: 'u1',
        title_id: 'b1',
        status: 'in-reserve',
        lote_id: 'lote-a',
      },
    ],
  });
});

describe('GET /backoffice/estoque', () => {
  it('retorna 401 sem JWT', async () => {
    const res = await app.request('/backoffice/estoque', {
      headers: { 'x-api-key': 'chave-front' },
    });
    expect(res.status).toBe(401);
  });

  it('retorna o saldo por título da região', async () => {
    const res = await app.request('/backoffice/estoque', {
      headers: await authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<Record<string, unknown>>;
    expect(body).toEqual([
      {
        book_id: 'b1',
        acquired: 3,
        reserved: 1,
        picked_up: 0,
        sold: 0,
        available: 2,
      },
    ]);
  });
});
