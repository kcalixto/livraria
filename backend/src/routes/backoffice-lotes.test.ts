import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  PutCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { sign } from 'hono/jwt';
import { app } from '../app';

const ddbMock = mockClient(DynamoDBDocumentClient);
const REGION = 'SP, Capital - Zona Sul';

async function authHeaders(): Promise<Record<string, string>> {
  const token = await sign(
    { role: 'admin', exp: Math.floor(Date.now() / 1000) + 3600 },
    'segredo-jwt-teste',
  );
  return {
    'x-api-key': 'chave-front',
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  };
}

const lotes = [
  {
    id: 'lote-a',
    date: '2026-07-01',
    region: REGION,
    books: [
      { book_id: 'b1', amount: 3 },
      { book_id: 'b2', amount: 2 },
    ],
    total_cost: 10000,
    created_at: '2026-07-01T10:00:00.000Z',
  },
  {
    id: 'lote-b',
    date: '2026-07-10',
    region: REGION,
    books: [{ book_id: 'b1', amount: 2 }],
    total_cost: 6000,
    created_at: '2026-07-10T10:00:00.000Z',
  },
];

const pedidos = [
  {
    id: 'PED001',
    region: REGION,
    unit_id: 'u1',
    title_id: 'b1',
    status: 'payment-received',
    lote_id: 'lote-a',
    received_amount: 5500,
  },
  {
    id: 'PED001',
    region: REGION,
    unit_id: 'u2',
    title_id: 'b1',
    status: 'in-reserve',
    lote_id: 'lote-a',
  },
];

beforeEach(() => {
  ddbMock.reset();
  process.env.LIVRARIA_FRONT_END_API_KEY = 'chave-front';
  process.env.JWT_SECRET = 'segredo-jwt-teste';
  process.env.LOTES_TABLE_NAME = 'livraria-tb-lotes-test';
  process.env.PEDIDOS_TABLE_NAME = 'livraria-tb-pedidos-test';
  ddbMock.on(ScanCommand, { TableName: 'livraria-tb-lotes-test' }).resolves({ Items: lotes });
  ddbMock
    .on(ScanCommand, { TableName: 'livraria-tb-pedidos-test' })
    .resolves({ Items: pedidos });
  ddbMock.on(PutCommand).resolves({});
});

describe('POST /backoffice/lotes', () => {
  const validBody = {
    date: '2026-07-11',
    region: REGION,
    books: [{ book_id: 'b1', amount: 5 }],
    total_cost: 12000,
  };

  it('retorna 401 sem JWT', async () => {
    const res = await app.request('/backoffice/lotes', {
      method: 'POST',
      body: JSON.stringify(validBody),
      headers: { 'x-api-key': 'chave-front', 'content-type': 'application/json' },
    });
    expect(res.status).toBe(401);
  });

  it('cria lote com uuid e timestamps', async () => {
    const res = await app.request('/backoffice/lotes', {
      method: 'POST',
      body: JSON.stringify(validBody),
      headers: await authHeaders(),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body).toMatchObject(validBody);
    expect(body.created_at).toBeTruthy();

    const put = ddbMock.commandCalls(PutCommand)[0].args[0].input;
    expect(put.TableName).toBe('livraria-tb-lotes-test');
  });

  it.each([
    ['sem date', { ...validBody, date: '' }],
    ['sem region', { ...validBody, region: undefined }],
    ['books vazio', { ...validBody, books: [] }],
    ['amount inválido', { ...validBody, books: [{ book_id: 'b1', amount: 0 }] }],
    ['book sem id', { ...validBody, books: [{ amount: 1 }] }],
    ['total_cost negativo', { ...validBody, total_cost: -1 }],
    ['total_cost não inteiro', { ...validBody, total_cost: 10.5 }],
  ])('retorna 400: %s', async (_label, body) => {
    const res = await app.request('/backoffice/lotes', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: await authHeaders(),
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /backoffice/lotes', () => {
  it('lista lotes da região com agregados (gasto, nº livros, vendido)', async () => {
    const res = await app.request(`/backoffice/lotes?region=${encodeURIComponent(REGION)}`, {
      headers: await authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<Record<string, unknown>>;
    expect(body).toHaveLength(2);
    // mais novo primeiro na listagem
    expect(body[0]).toMatchObject({ id: 'lote-b', total_cost: 6000, total_books: 2, sold_value: 0 });
    expect(body[1]).toMatchObject({
      id: 'lote-a',
      date: '2026-07-01',
      total_cost: 10000,
      total_books: 5,
      sold_value: 5500,
    });
  });
});

describe('GET /backoffice/lotes/:id', () => {
  it('retorna o detalhe por livro com contagens e restante', async () => {
    const res = await app.request(
      `/backoffice/lotes/lote-a?region=${encodeURIComponent(REGION)}`,
      { headers: await authHeaders() },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ id: 'lote-a', total_cost: 10000, sold_value: 5500 });

    const books = body.books as Array<Record<string, unknown>>;
    const b1 = books.find((b) => b.book_id === 'b1');
    expect(b1).toMatchObject({
      acquired: 3,
      reserved: 1,
      picked_up: 0,
      sold: 1,
      remaining: 1,
    });
    const b2 = books.find((b) => b.book_id === 'b2');
    expect(b2).toMatchObject({ acquired: 2, remaining: 2 });
  });

  it('404 para lote inexistente', async () => {
    const res = await app.request(
      `/backoffice/lotes/nao-existe?region=${encodeURIComponent(REGION)}`,
      { headers: await authHeaders() },
    );
    expect(res.status).toBe(404);
  });
});
