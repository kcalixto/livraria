import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { sign } from 'hono/jwt';
import { app } from '../app';

const ddbMock = mockClient(DynamoDBDocumentClient);

async function authHeader(opts: { expired?: boolean; secret?: string } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const token = await sign(
    { role: 'admin', exp: opts.expired ? now - 10 : now + 3600 },
    opts.secret ?? 'segredo-jwt-teste',
  );
  return { authorization: `Bearer ${token}`, 'x-api-key': 'chave-front' };
}

const unit = (over: Record<string, unknown>) => ({
  id: 'PED001',
  book_id: 'livro-a#u1',
  title_id: 'livro-a',
  unit_id: 'u1',
  name: 'Camarada Rosa',
  contact: '(11) 9 8888-0000',
  region: 'SP, Capital - Zona Sul',
  status: 'waiting-payment',
  created_at: '2026-07-09T14:00:00.000Z',
  updated_at: '2026-07-09T14:00:00.000Z',
  ...over,
});

beforeEach(() => {
  ddbMock.reset();
  process.env.LIVRARIA_FRONT_END_API_KEY = 'chave-front';
  process.env.JWT_SECRET = 'segredo-jwt-teste';
  process.env.PEDIDOS_TABLE_NAME = 'livraria-tb-pedidos-test';
});

describe('auth JWT nas rotas de pedidos do backoffice', () => {
  it.each<[string, () => Promise<Record<string, string>>]>([
    ['sem token', async () => ({ 'x-api-key': 'chave-front' })],
    ['token expirado', () => authHeader({ expired: true })],
    ['token com secret errado', () => authHeader({ secret: 'outro' })],
  ])('retorna 401: %s', async (_label, buildHeaders) => {
    const res = await app.request('/backoffice/pedidos', {
      headers: await buildHeaders(),
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /backoffice/pedidos (agrupado no backend)', () => {
  it('retorna array de pedidos, cada um com items[] de unidades', async () => {
    ddbMock.on(ScanCommand).resolves({
      Items: [
        unit({ id: 'PED001', book_id: 'livro-a#u1', unit_id: 'u1' }),
        unit({ id: 'PED001', book_id: 'livro-a#u2', unit_id: 'u2', status: 'in-reserve' }),
        unit({
          id: 'PED002',
          book_id: 'livro-b#u3',
          title_id: 'livro-b',
          unit_id: 'u3',
          name: 'J. Prestes',
          created_at: '2026-07-10T10:00:00.000Z',
        }),
      ],
    });

    const res = await app.request('/backoffice/pedidos', {
      headers: await authHeader(),
    });

    expect(res.status).toBe(200);
    const orders = (await res.json()) as Array<Record<string, unknown>>;

    expect(orders).toHaveLength(2);
    // mais novo primeiro
    expect(orders[0]).toMatchObject({ id: 'PED002', name: 'J. Prestes' });
    expect(orders[1]).toMatchObject({
      id: 'PED001',
      name: 'Camarada Rosa',
      contact: '(11) 9 8888-0000',
      region: 'SP, Capital - Zona Sul',
      created_at: '2026-07-09T14:00:00.000Z',
    });

    const items = orders[1].items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.unit_id).sort()).toEqual(['u1', 'u2']);
    expect(items[0]).toHaveProperty('title_id', 'livro-a');
    expect(items[0]).toHaveProperty('status');
    // não vaza dados do agrupador dentro do item
    expect(items[0]).not.toHaveProperty('name');
  });
});

function mockLotes(lotes: Record<string, unknown>[]) {
  ddbMock
    .on(ScanCommand, { TableName: 'livraria-tb-lotes-test' })
    .resolves({ Items: lotes });
}

function mockPedidosScan(units: Record<string, unknown>[]) {
  ddbMock
    .on(ScanCommand, { TableName: 'livraria-tb-pedidos-test' })
    .resolves({ Items: units });
}

const REGION = 'SP, Capital - Zona Sul';

const LOTE_ANTIGO = {
  id: 'lote-antigo',
  date: '2026-07-01',
  region: REGION,
  books: [{ book_id: 'livro-a', amount: 1 }],
  total_cost: 1000,
};
const LOTE_NOVO = {
  id: 'lote-novo',
  date: '2026-07-10',
  region: REGION,
  books: [{ book_id: 'livro-a', amount: 1 }],
  total_cost: 1000,
};

async function patchUnit(body: Record<string, unknown>) {
  return app.request('/backoffice/pedidos/PED001/status', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { ...(await authHeader()), 'content-type': 'application/json' },
  });
}

describe('PATCH — transições e alocação FIFO', () => {
  beforeEach(() => {
    process.env.LOTES_TABLE_NAME = 'livraria-tb-lotes-test';
    ddbMock.on(UpdateCommand).resolves({});
  });

  it('waiting→in-reserve aloca o lote mais antigo com unidade livre (FIFO)', async () => {
    const line = unit({ book_id: 'livro-a#u1', unit_id: 'u1' });
    ddbMock.on(QueryCommand).resolves({ Items: [line] });
    mockLotes([LOTE_NOVO, LOTE_ANTIGO]);
    mockPedidosScan([line]);

    const res = await patchUnit({ status: 'in-reserve', unit_id: 'u1' });

    expect(res.status).toBe(200);
    const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
    expect(input.Key).toEqual({ id: 'PED001', book_id: 'livro-a#u1' });
    expect(input.UpdateExpression).toContain('lote_id');
    expect(input.ExpressionAttributeValues![':lote_id']).toBe('lote-antigo');
  });

  it('FIFO pula lote sem unidade livre (unidade já alocada em outro pedido)', async () => {
    const line = unit({ book_id: 'livro-a#u1', unit_id: 'u1' });
    const ocupada = unit({
      id: 'PED999',
      book_id: 'livro-a#u9',
      unit_id: 'u9',
      status: 'in-reserve',
      lote_id: 'lote-antigo',
    });
    ddbMock.on(QueryCommand).resolves({ Items: [line] });
    mockLotes([LOTE_ANTIGO, LOTE_NOVO]);
    mockPedidosScan([line, ocupada]);

    const res = await patchUnit({ status: 'in-reserve', unit_id: 'u1' });

    expect(res.status).toBe(200);
    const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
    expect(input.ExpressionAttributeValues![':lote_id']).toBe('lote-novo');
  });

  it('sem estoque livre na região → 400 e nada muda', async () => {
    const line = unit({ book_id: 'livro-a#u1', unit_id: 'u1' });
    ddbMock.on(QueryCommand).resolves({ Items: [line] });
    mockLotes([]); // nenhum lote
    mockPedidosScan([line]);

    const res = await patchUnit({ status: 'in-reserve', unit_id: 'u1' });

    expect(res.status).toBe(400);
    expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(0);
  });

  it('in-reserve→waiting-payment libera a unidade (REMOVE lote_id)', async () => {
    const line = unit({
      book_id: 'livro-a#u1',
      unit_id: 'u1',
      status: 'in-reserve',
      lote_id: 'lote-antigo',
    });
    ddbMock.on(QueryCommand).resolves({ Items: [line] });

    const res = await patchUnit({ status: 'waiting-payment', unit_id: 'u1' });

    expect(res.status).toBe(200);
    const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
    expect(input.UpdateExpression).toMatch(/REMOVE.*lote_id/);
  });

  it('payment-received exige received_amount', async () => {
    const line = unit({
      book_id: 'livro-a#u1',
      unit_id: 'u1',
      status: 'in-reserve',
      lote_id: 'lote-antigo',
    });
    ddbMock.on(QueryCommand).resolves({ Items: [line] });

    const res = await patchUnit({ status: 'payment-received', unit_id: 'u1' });

    expect(res.status).toBe(400);
    expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(0);
  });

  it('in-reserve→payment-received mantém o lote e grava valor recebido + paid_at', async () => {
    const line = unit({
      book_id: 'livro-a#u1',
      unit_id: 'u1',
      status: 'in-reserve',
      lote_id: 'lote-antigo',
    });
    ddbMock.on(QueryCommand).resolves({ Items: [line] });

    const res = await patchUnit({
      status: 'payment-received',
      unit_id: 'u1',
      received_amount: 5500,
    });

    expect(res.status).toBe(200);
    const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
    expect(input.ExpressionAttributeValues![':received_amount']).toBe(5500);
    // data do pagamento registrada (pro CSV de vendas)
    expect(input.ExpressionAttributeValues![':paid_at']).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // não realoca lote
    expect(input.ExpressionAttributeValues![':lote_id']).toBeUndefined();
  });

  it('waiting→payment-received direto aloca lote e grava valor', async () => {
    const line = unit({ book_id: 'livro-a#u1', unit_id: 'u1' });
    ddbMock.on(QueryCommand).resolves({ Items: [line] });
    mockLotes([LOTE_ANTIGO]);
    mockPedidosScan([line]);

    const res = await patchUnit({
      status: 'payment-received',
      unit_id: 'u1',
      received_amount: 4000,
    });

    expect(res.status).toBe(200);
    const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
    expect(input.ExpressionAttributeValues![':lote_id']).toBe('lote-antigo');
    expect(input.ExpressionAttributeValues![':received_amount']).toBe(4000);
  });

  it('transição inválida (waiting→sent-to-delivery) → 400', async () => {
    const line = unit({ book_id: 'livro-a#u1', unit_id: 'u1' });
    ddbMock.on(QueryCommand).resolves({ Items: [line] });

    const res = await patchUnit({ status: 'sent-to-delivery', unit_id: 'u1' });
    expect(res.status).toBe(400);
  });

  it('unidade picked_up só pode ir para payment-received', async () => {
    const line = unit({
      book_id: 'livro-a#u1',
      unit_id: 'u1',
      picked_up: true,
      lote_id: 'lote-antigo',
    });
    ddbMock.on(QueryCommand).resolves({ Items: [line] });

    const reserva = await patchUnit({ status: 'in-reserve', unit_id: 'u1' });
    expect(reserva.status).toBe(400);

    const pagamento = await patchUnit({
      status: 'payment-received',
      unit_id: 'u1',
      received_amount: 3000,
    });
    expect(pagamento.status).toBe(200);
    const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
    expect(input.ExpressionAttributeValues![':received_amount']).toBe(3000);
  });
});

describe('PATCH — retirado sem pagamento (picked_up)', () => {
  beforeEach(() => {
    process.env.LOTES_TABLE_NAME = 'livraria-tb-lotes-test';
    ddbMock.on(UpdateCommand).resolves({});
  });

  it('marca retirado de waiting: aloca lote e seta picked_up', async () => {
    const line = unit({ book_id: 'livro-a#u1', unit_id: 'u1' });
    ddbMock.on(QueryCommand).resolves({ Items: [line] });
    mockLotes([LOTE_ANTIGO]);
    mockPedidosScan([line]);

    const res = await patchUnit({ picked_up: true, unit_id: 'u1' });

    expect(res.status).toBe(200);
    const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
    expect(input.ExpressionAttributeValues![':picked_up']).toBe(true);
    expect(input.ExpressionAttributeValues![':lote_id']).toBe('lote-antigo');
    expect(input.ExpressionAttributeValues![':status']).toBe('waiting-payment');
  });

  it('marca retirado de in-reserve: mantém o lote já alocado e volta pra waiting', async () => {
    const line = unit({
      book_id: 'livro-a#u1',
      unit_id: 'u1',
      status: 'in-reserve',
      lote_id: 'lote-antigo',
    });
    ddbMock.on(QueryCommand).resolves({ Items: [line] });

    const res = await patchUnit({ picked_up: true, unit_id: 'u1' });

    expect(res.status).toBe(200);
    const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
    expect(input.ExpressionAttributeValues![':picked_up']).toBe(true);
    expect(input.ExpressionAttributeValues![':status']).toBe('waiting-payment');
    // não realoca
    expect(input.ExpressionAttributeValues![':lote_id']).toBeUndefined();
  });

  it('sem estoque livre, marcar retirado falha com 400', async () => {
    const line = unit({ book_id: 'livro-a#u1', unit_id: 'u1' });
    ddbMock.on(QueryCommand).resolves({ Items: [line] });
    mockLotes([]);
    mockPedidosScan([line]);

    const res = await patchUnit({ picked_up: true, unit_id: 'u1' });
    expect(res.status).toBe(400);
  });

  it('desfaz retirado (reversível): REMOVE picked_up e lote_id', async () => {
    const line = unit({
      book_id: 'livro-a#u1',
      unit_id: 'u1',
      picked_up: true,
      lote_id: 'lote-antigo',
    });
    ddbMock.on(QueryCommand).resolves({ Items: [line] });

    const res = await patchUnit({ picked_up: false, unit_id: 'u1' });

    expect(res.status).toBe(200);
    const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
    expect(input.UpdateExpression).toMatch(/REMOVE.*picked_up.*lote_id|REMOVE.*lote_id.*picked_up/);
  });

  it('não desfaz retirado de unidade já paga', async () => {
    const line = unit({
      book_id: 'livro-a#u1',
      unit_id: 'u1',
      status: 'payment-received',
      picked_up: true,
      lote_id: 'lote-antigo',
      received_amount: 3000,
    });
    ddbMock.on(QueryCommand).resolves({ Items: [line] });

    const res = await patchUnit({ picked_up: false, unit_id: 'u1' });
    expect(res.status).toBe(400);
  });
});

describe('PATCH — validações básicas', () => {
  it('retorna 400 sem unit_id', async () => {
    const res = await app.request('/backoffice/pedidos/PED001/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'in-reserve' }),
      headers: { ...(await authHeader()), 'content-type': 'application/json' },
    });
    expect(res.status).toBe(400);
  });

  it('retorna 404 quando o unit_id não pertence ao pedido', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [unit({ book_id: 'livro-a#u1', unit_id: 'u1' })],
    });

    const res = await app.request('/backoffice/pedidos/PED001/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'in-reserve', unit_id: 'nao-tem' }),
      headers: { ...(await authHeader()), 'content-type': 'application/json' },
    });
    expect(res.status).toBe(404);
  });

  it('retorna 400 com status inválido', async () => {
    const res = await app.request('/backoffice/pedidos/PED001/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'cancelado', unit_id: 'u1' }),
      headers: { ...(await authHeader()), 'content-type': 'application/json' },
    });
    expect(res.status).toBe(400);
  });
});

describe('PATCH — pagamento com preço social', () => {
  beforeEach(() => {
    process.env.LOTES_TABLE_NAME = 'livraria-tb-lotes-test';
    ddbMock.on(UpdateCommand).resolves({});
  });

  it('grava social_price: true na unidade quando o pagamento é social', async () => {
    const line = unit({
      book_id: 'livro-a#u1',
      unit_id: 'u1',
      status: 'in-reserve',
      lote_id: 'lote-antigo',
    });
    ddbMock.on(QueryCommand).resolves({ Items: [line] });

    const res = await patchUnit({
      status: 'payment-received',
      unit_id: 'u1',
      received_amount: 2500,
      social_price: true,
    });

    expect(res.status).toBe(200);
    const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
    expect(input.ExpressionAttributeValues![':social_price']).toBe(true);
    expect(input.ExpressionAttributeValues![':received_amount']).toBe(2500);
  });

  it('sem a flag, não grava social_price', async () => {
    const line = unit({
      book_id: 'livro-a#u1',
      unit_id: 'u1',
      status: 'in-reserve',
      lote_id: 'lote-antigo',
    });
    ddbMock.on(QueryCommand).resolves({ Items: [line] });

    const res = await patchUnit({
      status: 'payment-received',
      unit_id: 'u1',
      received_amount: 2500,
    });

    expect(res.status).toBe(200);
    const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
    expect(input.ExpressionAttributeValues![':social_price']).toBeUndefined();
  });

  it('GET agrupado expõe social_price na unidade', async () => {
    ddbMock.on(ScanCommand).resolves({
      Items: [unit({ book_id: 'livro-a#u1', unit_id: 'u1', social_price: true })],
    });

    const res = await app.request('/backoffice/pedidos', { headers: await authHeader() });
    const orders = (await res.json()) as Array<{ items: Array<Record<string, unknown>> }>;
    expect(orders[0].items[0]).toHaveProperty('social_price', true);
  });
});

describe('PATCH — observação por unidade', () => {
  beforeEach(() => {
    ddbMock.on(UpdateCommand).resolves({});
  });

  it('grava a observação da unidade (trim aplicado)', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [unit({ book_id: 'livro-a#u1', unit_id: 'u1' })],
    });

    const res = await patchUnit({ unit_id: 'u1', observation: '  Entregar após as 18h  ' });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      id: 'PED001',
      unit_id: 'u1',
      observation: 'Entregar após as 18h',
    });
    const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
    expect(input.ExpressionAttributeValues![':observation']).toBe('Entregar após as 18h');
    // não mexe em status
    expect(input.ExpressionAttributeValues![':status']).toBeUndefined();
  });

  it('observação vazia REMOVE o atributo', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [unit({ book_id: 'livro-a#u1', unit_id: 'u1', observation: 'antiga' })],
    });

    const res = await patchUnit({ unit_id: 'u1', observation: '   ' });

    expect(res.status).toBe(200);
    const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
    expect(input.UpdateExpression).toContain('REMOVE #observation');
  });

  it('rejeita observação acima de 1000 caracteres', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [unit({ book_id: 'livro-a#u1', unit_id: 'u1' })],
    });

    const res = await patchUnit({ unit_id: 'u1', observation: 'x'.repeat(1001) });
    expect(res.status).toBe(400);
    expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(0);
  });

  it('GET agrupado expõe observation na unidade', async () => {
    ddbMock.on(ScanCommand).resolves({
      Items: [unit({ book_id: 'livro-a#u1', unit_id: 'u1', observation: 'Cliente avisado' })],
    });

    const res = await app.request('/backoffice/pedidos', { headers: await authHeader() });
    const orders = (await res.json()) as Array<{ items: Array<Record<string, unknown>> }>;
    expect(orders[0].items[0]).toHaveProperty('observation', 'Cliente avisado');
  });
});
