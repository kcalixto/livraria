import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  QueryCommand,
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
  return { authorization: `Bearer ${token}` };
}

beforeEach(() => {
  ddbMock.reset();
  process.env.JWT_SECRET = 'segredo-jwt-teste';
  process.env.PEDIDOS_TABLE_NAME = 'livraria-tb-pedidos-test';
});

describe('auth JWT nas rotas de pedidos do backoffice', () => {
  it.each<[string, () => Promise<Record<string, string>>]>([
    ['sem token', async () => ({})],
    ['token expirado', () => authHeader({ expired: true })],
    ['token com secret errado', () => authHeader({ secret: 'outro' })],
  ])('retorna 401: %s', async (_label, buildHeaders) => {
    const res = await app.request('/backoffice/pedidos?status=waiting-payment', {
      headers: await buildHeaders(),
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /backoffice/pedidos', () => {
  it('consulta o GSI status-index pelo status informado', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [{ id: 'p1', book_id: 'b1', status: 'waiting-payment' }],
    });

    const res = await app.request('/backoffice/pedidos?status=waiting-payment', {
      headers: await authHeader(),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      { id: 'p1', book_id: 'b1', status: 'waiting-payment' },
    ]);

    const input = ddbMock.commandCalls(QueryCommand)[0].args[0].input;
    expect(input.TableName).toBe('livraria-tb-pedidos-test');
    expect(input.IndexName).toBe('status-index');
    expect(input.ExpressionAttributeValues).toMatchObject({
      ':status': 'waiting-payment',
    });
  });

  it('retorna 400 com status inválido ou ausente', async () => {
    for (const qs of ['?status=inexistente', '']) {
      const res = await app.request(`/backoffice/pedidos${qs}`, {
        headers: await authHeader(),
      });
      expect(res.status).toBe(400);
    }
  });
});

describe('PATCH /backoffice/pedidos/:id/status', () => {
  it('atualiza o status de todos os itens do pedido', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [
        { id: 'p1', book_id: 'b1', status: 'waiting-payment' },
        { id: 'p1', book_id: 'b2', status: 'waiting-payment' },
      ],
    });
    ddbMock.on(UpdateCommand).resolves({});

    const res = await app.request('/backoffice/pedidos/p1/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'payment-received' }),
      headers: { ...(await authHeader()), 'content-type': 'application/json' },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'p1', status: 'payment-received' });

    const updates = ddbMock.commandCalls(UpdateCommand);
    expect(updates).toHaveLength(2);
    const keys = updates.map((u) => u.args[0].input.Key);
    expect(keys).toContainEqual({ id: 'p1', book_id: 'b1' });
    expect(keys).toContainEqual({ id: 'p1', book_id: 'b2' });
    for (const u of updates) {
      expect(u.args[0].input.ExpressionAttributeValues).toMatchObject({
        ':status': 'payment-received',
      });
    }
  });

  it('retorna 404 quando o pedido não existe', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    const res = await app.request('/backoffice/pedidos/nao-existe/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'payment-received' }),
      headers: { ...(await authHeader()), 'content-type': 'application/json' },
    });
    expect(res.status).toBe(404);
  });

  it('retorna 400 com status inválido', async () => {
    const res = await app.request('/backoffice/pedidos/p1/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'cancelado' }),
      headers: { ...(await authHeader()), 'content-type': 'application/json' },
    });
    expect(res.status).toBe(400);
  });
});
