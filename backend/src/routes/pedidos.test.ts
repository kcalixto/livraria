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

describe('GET /pedidos/:id (consulta pública por código)', () => {
  const lines = [
    {
      id: 'AJ3C9K',
      book_id: 'livro-a#u1',
      title_id: 'livro-a',
      unit_id: 'u1',
      name: 'Camarada Rosa',
      contact: '(11) 9 8888-0000',
      region: 'SP, Capital - Zona Sul',
      status: 'sent-to-delivery',
      observation: 'Sai na quinta',
      created_at: '2026-07-09T14:00:00.000Z',
    },
    {
      id: 'AJ3C9K',
      book_id: 'livro-b#u2',
      title_id: 'livro-b',
      unit_id: 'u2',
      name: 'Camarada Rosa',
      contact: '(11) 9 8888-0000',
      region: 'SP, Capital - Zona Sul',
      status: 'payment-received',
      picked_up: true,
      created_at: '2026-07-09T14:00:00.000Z',
    },
  ];

  it('retorna status e observação por unidade, SEM name/contact', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: lines });

    const res = await app.request('/pedidos/AJ3C9K', { headers: JSON_HEADER });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ id: 'AJ3C9K', created_at: '2026-07-09T14:00:00.000Z' });
    expect(body).not.toHaveProperty('name');
    expect(body).not.toHaveProperty('contact');

    const items = body.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title_id: 'livro-a',
      status: 'sent-to-delivery',
      observation: 'Sai na quinta',
    });
    expect(items[1]).toMatchObject({ title_id: 'livro-b', picked_up: true });
    for (const item of items) {
      expect(item).not.toHaveProperty('name');
      expect(item).not.toHaveProperty('contact');
      expect(item).not.toHaveProperty('received_amount');
    }
  });

  it('normaliza o código (hífen e minúsculas)', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: lines });

    const res = await app.request('/pedidos/aj3-c9k', { headers: JSON_HEADER });

    expect(res.status).toBe(200);
    const query = ddbMock.commandCalls(QueryCommand)[0].args[0].input;
    expect(query.ExpressionAttributeValues![':id']).toBe('AJ3C9K');
  });

  it('404 quando o código não existe', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    const res = await app.request('/pedidos/XXXXXX', { headers: JSON_HEADER });
    expect(res.status).toBe(404);
  });
});

describe('POST /pedidos/:id/cancelamento (solicitação pública por item)', () => {
  const lines = [
    {
      id: 'AJ3C9K',
      book_id: 'livro-a#u1',
      title_id: 'livro-a',
      unit_id: 'u1',
      status: 'waiting-payment',
      region: 'SP, Capital - Zona Sul',
      created_at: '2026-07-09T14:00:00.000Z',
    },
    {
      id: 'AJ3C9K',
      book_id: 'livro-b#u2',
      title_id: 'livro-b',
      unit_id: 'u2',
      status: 'received',
      region: 'SP, Capital - Zona Sul',
      created_at: '2026-07-09T14:00:00.000Z',
    },
  ];

  async function requestCancel(code: string, body: Record<string, unknown>) {
    return app.request(`/pedidos/${code}/cancelamento`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: JSON_HEADER,
    });
  }

  it('marca cancel_requested na unidade (código com hífen/minúsculas)', async () => {
    const { UpdateCommand } = await import('@aws-sdk/lib-dynamodb');
    ddbMock.on(QueryCommand).resolves({ Items: lines });
    ddbMock.on(UpdateCommand).resolves({});

    const res = await requestCancel('aj3-c9k', { unit_id: 'u1' });

    expect(res.status).toBe(200);
    const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
    expect(input.Key).toEqual({ id: 'AJ3C9K', book_id: 'livro-a#u1' });
    expect(input.ExpressionAttributeValues![':cancel_requested']).toBe(true);
    expect(input.ExpressionAttributeValues![':cancel_requested_at']).toBeTruthy();
  });

  it('400 pra unidade finalizada, já solicitada ou sem unit_id; 404 pra inexistentes', async () => {
    const { UpdateCommand } = await import('@aws-sdk/lib-dynamodb');
    ddbMock.on(UpdateCommand).resolves({});

    ddbMock.on(QueryCommand).resolves({ Items: lines });
    expect((await requestCancel('AJ3C9K', { unit_id: 'u2' })).status).toBe(400); // finalizada
    expect((await requestCancel('AJ3C9K', {})).status).toBe(400); // sem unit_id
    expect((await requestCancel('AJ3C9K', { unit_id: 'nao-tem' })).status).toBe(404);

    ddbMock.on(QueryCommand).resolves({
      Items: [{ ...lines[0], cancel_requested: true }],
    });
    expect((await requestCancel('AJ3C9K', { unit_id: 'u1' })).status).toBe(400); // já solicitada

    ddbMock.on(QueryCommand).resolves({ Items: [] });
    expect((await requestCancel('XXXXXX', { unit_id: 'u1' })).status).toBe(404);
    expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(0);
  });

  it('GET público expõe unit_id e cancel_requested por item', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [{ ...lines[0], cancel_requested: true }],
    });

    const res = await app.request('/pedidos/AJ3C9K', { headers: JSON_HEADER });
    const body = (await res.json()) as { items: Array<Record<string, unknown>> };
    expect(body.items[0]).toMatchObject({ unit_id: 'u1', cancel_requested: true });
  });
});
