import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { app } from '../app';

const ddbMock = mockClient(DynamoDBDocumentClient);
const JSON_HEADER = { 'content-type': 'application/json', 'x-api-key': 'chave-front' };

const validBody = {
  name: 'Fulano',
  contact: 'telegram @fulano',
  region: 'SP, Capital - Zona Sul',
  items: [
    { book_id: 'livro-a', amount: 2 },
    { book_id: 'livro-b', amount: 1 },
  ],
};

function writtenItems() {
  return ddbMock
    .commandCalls(BatchWriteCommand)
    .flatMap(
      (call) =>
        call.args[0].input.RequestItems!['livraria-tb-pedidos-test'].map(
          (r) => r.PutRequest!.Item!,
        ),
    );
}

beforeEach(() => {
  ddbMock.reset();
  ddbMock.on(QueryCommand).resolves({ Items: [] });
  process.env.LIVRARIA_FRONT_END_API_KEY = 'chave-front';
  process.env.PEDIDOS_TABLE_NAME = 'livraria-tb-pedidos-test';
});

describe('POST /pedidos (linhas por unidade)', () => {
  it('explode cada item em uma linha-unidade com chave title_id#unit_id', async () => {
    ddbMock.on(BatchWriteCommand).resolves({});

    const res = await app.request('/pedidos', {
      method: 'POST',
      body: JSON.stringify(validBody),
      headers: JSON_HEADER,
    });

    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect(id).toMatch(/^[A-Z0-9]{6}$/);

    const items = writtenItems();
    expect(items).toHaveLength(3); // 2 unidades do livro-a + 1 do livro-b

    for (const item of items) {
      expect(item.id).toBe(id);
      expect(item.status).toBe('waiting-payment');
      expect(item.name).toBe('Fulano');
      expect(item.region).toBe('SP, Capital - Zona Sul');
      expect(item.unit_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(item.book_id).toBe(`${item.title_id}#${item.unit_id}`);
      expect(item).not.toHaveProperty('amount');
      expect(item.created_at).toBeTruthy();
    }

    const unitIds = items.map((i) => i.unit_id);
    expect(new Set(unitIds).size).toBe(3); // unit_ids distintos

    expect(items.filter((i) => i.title_id === 'livro-a')).toHaveLength(2);
    expect(items.filter((i) => i.title_id === 'livro-b')).toHaveLength(1);
  });

  it('grava em pacotes de 25 quando o pedido tem mais de 25 unidades', async () => {
    ddbMock.on(BatchWriteCommand).resolves({});

    const res = await app.request('/pedidos', {
      method: 'POST',
      body: JSON.stringify({
        ...validBody,
        items: [{ book_id: 'livro-a', amount: 60 }],
      }),
      headers: JSON_HEADER,
    });

    expect(res.status).toBe(201);
    const batches = ddbMock.commandCalls(BatchWriteCommand);
    expect(batches).toHaveLength(3); // 25 + 25 + 10
    const sizes = batches.map(
      (b) => b.args[0].input.RequestItems!['livraria-tb-pedidos-test'].length,
    );
    expect(sizes).toEqual([25, 25, 10]);
    expect(writtenItems()).toHaveLength(60);
  });

  it('soma amounts de book_id repetido antes de explodir', async () => {
    ddbMock.on(BatchWriteCommand).resolves({});

    const res = await app.request('/pedidos', {
      method: 'POST',
      body: JSON.stringify({
        ...validBody,
        items: [
          { book_id: 'livro-a', amount: 1 },
          { book_id: 'livro-a', amount: 2 },
        ],
      }),
      headers: JSON_HEADER,
    });

    expect(res.status).toBe(201);
    expect(writtenItems()).toHaveLength(3);
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
  });
});
