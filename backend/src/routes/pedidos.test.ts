import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { app } from '../app';

const ddbMock = mockClient(DynamoDBDocumentClient);
const JSON_HEADER = { 'content-type': 'application/json' };

const validBody = {
  name: 'Fulano',
  contact: 'telegram @fulano',
  region: 'SP, Capital - Zona Sul',
  items: [
    { book_id: 'b1', amount: 2 },
    { book_id: 'b2', amount: 1 },
  ],
};

beforeEach(() => {
  ddbMock.reset();
  ddbMock.on(QueryCommand).resolves({ Items: [] });
  process.env.PEDIDOS_TABLE_NAME = 'livraria-tb-pedidos-test';
});

describe('POST /pedidos', () => {
  it('cria um item por livro com o mesmo código de pedido (6 alfanuméricos maiúsculos) e status waiting-payment', async () => {
    ddbMock.on(BatchWriteCommand).resolves({});

    const res = await app.request('/pedidos', {
      method: 'POST',
      body: JSON.stringify(validBody),
      headers: JSON_HEADER,
    });

    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect(id).toMatch(/^[A-Z0-9]{6}$/);

    const calls = ddbMock.commandCalls(BatchWriteCommand);
    expect(calls).toHaveLength(1);
    const requests =
      calls[0].args[0].input.RequestItems!['livraria-tb-pedidos-test'];
    expect(requests).toHaveLength(2);
    const items = requests.map((r) => r.PutRequest!.Item!);
    for (const item of items) {
      expect(item.id).toBe(id);
      expect(item.status).toBe('waiting-payment');
      expect(item.name).toBe('Fulano');
      expect(item.contact).toBe('telegram @fulano');
      expect(item.region).toBe('SP, Capital - Zona Sul');
      expect(item.created_at).toBeTruthy();
      expect(item.updated_at).toBeTruthy();
    }
    expect(items.map((i) => i.book_id).sort()).toEqual(['b1', 'b2']);
    expect(items.find((i) => i.book_id === 'b1')!.amount).toBe(2);
  });

  it.each([
    ['sem name', { ...validBody, name: '' }],
    ['sem contact', { ...validBody, contact: undefined }],
    ['sem region', { ...validBody, region: '' }],
    ['items vazio', { ...validBody, items: [] }],
    ['amount zero', { ...validBody, items: [{ book_id: 'b1', amount: 0 }] }],
    ['amount não inteiro', { ...validBody, items: [{ book_id: 'b1', amount: 1.5 }] }],
    ['item sem book_id', { ...validBody, items: [{ amount: 1 }] }],
  ])('retorna 400: %s', async (_label, body) => {
    const res = await app.request('/pedidos', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: JSON_HEADER,
    });
    expect(res.status).toBe(400);
  });

  it('retorna 400 com mais de 25 itens (limite do BatchWrite)', async () => {
    const items = Array.from({ length: 26 }, (_, i) => ({ book_id: `b${i}`, amount: 1 }));
    const res = await app.request('/pedidos', {
      method: 'POST',
      body: JSON.stringify({ ...validBody, items }),
      headers: JSON_HEADER,
    });
    expect(res.status).toBe(400);
  });

  it('regenera o código quando há colisão com pedido existente', async () => {
    ddbMock.reset();
    ddbMock
      .on(QueryCommand)
      .resolvesOnce({ Items: [{ id: 'COLIDE', book_id: 'x' }] })
      .resolves({ Items: [] });
    ddbMock.on(BatchWriteCommand).resolves({});

    const res = await app.request('/pedidos', {
      method: 'POST',
      body: JSON.stringify(validBody),
      headers: JSON_HEADER,
    });

    expect(res.status).toBe(201);
    expect(ddbMock.commandCalls(QueryCommand)).toHaveLength(2);
    expect(ddbMock.commandCalls(BatchWriteCommand)).toHaveLength(1);
  });

  it('deduplica book_id repetido somando amounts', async () => {
    ddbMock.on(BatchWriteCommand).resolves({});

    const res = await app.request('/pedidos', {
      method: 'POST',
      body: JSON.stringify({
        ...validBody,
        items: [
          { book_id: 'b1', amount: 1 },
          { book_id: 'b1', amount: 2 },
        ],
      }),
      headers: JSON_HEADER,
    });

    expect(res.status).toBe(201);
    const requests =
      ddbMock.commandCalls(BatchWriteCommand)[0].args[0].input.RequestItems![
        'livraria-tb-pedidos-test'
      ];
    expect(requests).toHaveLength(1);
    expect(requests[0].PutRequest!.Item!.amount).toBe(3);
  });
});
