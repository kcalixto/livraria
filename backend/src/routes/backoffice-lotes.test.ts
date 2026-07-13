import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { sign } from 'hono/jwt';
import { app } from '../app';

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://presigned.example/comprovante'),
}));

const s3Mock = mockClient(S3Client);

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

describe('POST /backoffice/lotes/:id/transacoes', () => {
  const PDF_BASE64 = Buffer.from('%PDF-1.4 fake pdf').toString('base64');
  const PNG_BASE64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]).toString('base64');

  beforeEach(() => {
    s3Mock.reset();
    s3Mock.on(PutObjectCommand).resolves({});
    ddbMock.on(UpdateCommand).resolves({});
    process.env.ASSETS_S3_BUCKET_NAME = 'livraria-assets-bucket';
    process.env.STAGE = 'dev';
  });

  it('registra transação negativa (doação) com comprovante pdf no S3', async () => {
    const res = await app.request('/backoffice/lotes/lote-a/transacoes', {
      method: 'POST',
      body: JSON.stringify({
        date: '2026-07-12',
        recipient: 'Instituição X',
        amount: -3000,
        receipt_base64: PDF_BASE64,
        receipt_type: 'pdf',
      }),
      headers: await authHeaders(),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body).toMatchObject({
      date: '2026-07-12',
      recipient: 'Instituição X',
      amount: -3000,
    });
    expect(body.receipt_key).toBe(`dev/comprovantes/lote-a/${body.id}.pdf`);

    const put = s3Mock.commandCalls(PutObjectCommand)[0].args[0].input;
    expect(put.Bucket).toBe('livraria-assets-bucket');
    expect(put.Key).toBe(body.receipt_key);
    expect(put.ContentType).toBe('application/pdf');

    const update = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
    expect(update.TableName).toBe('livraria-tb-lotes-test');
    expect(update.Key).toEqual({ id: 'lote-a' });
    expect(update.UpdateExpression).toContain('transactions');
  });

  it('registra transação positiva sem comprovante', async () => {
    const res = await app.request('/backoffice/lotes/lote-a/transacoes', {
      method: 'POST',
      body: JSON.stringify({ date: '2026-07-12', recipient: 'Doador Y', amount: 2000 }),
      headers: await authHeaders(),
    });

    expect(res.status).toBe(201);
    expect(s3Mock.commandCalls(PutObjectCommand)).toHaveLength(0);
  });

  it('aceita comprovante png validando magic bytes', async () => {
    const res = await app.request('/backoffice/lotes/lote-a/transacoes', {
      method: 'POST',
      body: JSON.stringify({
        date: '2026-07-12',
        recipient: 'Z',
        amount: -100,
        receipt_base64: PNG_BASE64,
        receipt_type: 'png',
      }),
      headers: await authHeaders(),
    });
    expect(res.status).toBe(201);
  });

  it.each([
    ['amount zero', { date: '2026-07-12', recipient: 'X', amount: 0 }],
    ['amount não inteiro', { date: '2026-07-12', recipient: 'X', amount: 10.5 }],
    ['sem recipient', { date: '2026-07-12', amount: -100 }],
    ['sem date', { recipient: 'X', amount: -100 }],
    [
      'tipo de comprovante inválido',
      { date: '2026-07-12', recipient: 'X', amount: -100, receipt_base64: PDF_BASE64, receipt_type: 'gif' },
    ],
    [
      'conteúdo não bate com o tipo',
      { date: '2026-07-12', recipient: 'X', amount: -100, receipt_base64: PDF_BASE64, receipt_type: 'png' },
    ],
  ])('retorna 400: %s', async (_label, body) => {
    const res = await app.request('/backoffice/lotes/lote-a/transacoes', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: await authHeaders(),
    });
    expect(res.status).toBe(400);
  });

  it('rejeita comprovante acima de 5MB', async () => {
    const big = Buffer.alloc(5 * 1024 * 1024 + 1);
    Buffer.from('%PDF-').copy(big);
    const res = await app.request('/backoffice/lotes/lote-a/transacoes', {
      method: 'POST',
      body: JSON.stringify({
        date: '2026-07-12',
        recipient: 'X',
        amount: -100,
        receipt_base64: big.toString('base64'),
        receipt_type: 'pdf',
      }),
      headers: await authHeaders(),
    });
    expect(res.status).toBe(400);
  });

  it('404 para lote inexistente', async () => {
    const res = await app.request('/backoffice/lotes/nao-existe/transacoes', {
      method: 'POST',
      body: JSON.stringify({ date: '2026-07-12', recipient: 'X', amount: -100 }),
      headers: await authHeaders(),
    });
    expect(res.status).toBe(404);
  });
});

describe('GET /backoffice/lotes/:id/transacoes/:txId/comprovante', () => {
  it('retorna URL pré-assinada para o comprovante', async () => {
    ddbMock.on(ScanCommand, { TableName: 'livraria-tb-lotes-test' }).resolves({
      Items: [
        {
          ...lotes[0],
          transactions: [
            { id: 'tx-1', date: '2026-07-12', recipient: 'X', amount: -100, receipt_key: 'dev/comprovantes/lote-a/tx-1.pdf' },
          ],
        },
        lotes[1],
      ],
    });

    const res = await app.request('/backoffice/lotes/lote-a/transacoes/tx-1/comprovante', {
      headers: await authHeaders(),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'https://presigned.example/comprovante' });
  });

  it('404 quando a transação não tem comprovante', async () => {
    ddbMock.on(ScanCommand, { TableName: 'livraria-tb-lotes-test' }).resolves({
      Items: [
        { ...lotes[0], transactions: [{ id: 'tx-2', date: '2026-07-12', recipient: 'X', amount: 100 }] },
      ],
    });

    const res = await app.request('/backoffice/lotes/lote-a/transacoes/tx-2/comprovante', {
      headers: await authHeaders(),
    });
    expect(res.status).toBe(404);
  });
});

describe('transactions_total nos GETs de lotes', () => {
  it('lista e detalhe expõem a soma das transações', async () => {
    ddbMock.on(ScanCommand, { TableName: 'livraria-tb-lotes-test' }).resolves({
      Items: [
        {
          ...lotes[0],
          transactions: [
            { id: 't1', date: '2026-07-12', recipient: 'A', amount: -3000 },
            { id: 't2', date: '2026-07-13', recipient: 'B', amount: 1000 },
          ],
        },
        lotes[1],
      ],
    });

    const lista = (await (
      await app.request('/backoffice/lotes', { headers: await authHeaders() })
    ).json()) as Array<Record<string, unknown>>;
    expect(lista.find((l) => l.id === 'lote-a')!.transactions_total).toBe(-2000);
    expect(lista.find((l) => l.id === 'lote-b')!.transactions_total).toBe(0);

    const detalhe = (await (
      await app.request('/backoffice/lotes/lote-a', { headers: await authHeaders() })
    ).json()) as Record<string, unknown>;
    expect(detalhe.transactions_total).toBe(-2000);
    expect((detalhe.transactions as unknown[]).length).toBe(2);
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
