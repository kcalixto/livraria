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

describe('PATCH /backoffice/pedidos/:id/status (por unit_id)', () => {
  it('atualiza apenas a unidade informada', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [
        unit({ book_id: 'livro-a#u1', unit_id: 'u1' }),
        unit({ book_id: 'livro-a#u2', unit_id: 'u2' }),
      ],
    });
    ddbMock.on(UpdateCommand).resolves({});

    const res = await app.request('/backoffice/pedidos/PED001/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'in-reserve', unit_id: 'u2' }),
      headers: { ...(await authHeader()), 'content-type': 'application/json' },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'PED001', unit_id: 'u2', status: 'in-reserve' });

    const updates = ddbMock.commandCalls(UpdateCommand);
    expect(updates).toHaveLength(1);
    expect(updates[0].args[0].input.Key).toEqual({ id: 'PED001', book_id: 'livro-a#u2' });
  });

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
