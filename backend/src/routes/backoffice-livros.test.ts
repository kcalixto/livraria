import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { sign } from 'hono/jwt';
import { app } from '../app';

const ddbMock = mockClient(DynamoDBDocumentClient);

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

beforeEach(() => {
  ddbMock.reset();
  process.env.LIVRARIA_FRONT_END_API_KEY = 'chave-front';
  process.env.BACKOFFICE_ADMIN_API_KEY = 'chave-admin';
  process.env.JWT_SECRET = 'segredo-jwt-teste';
  process.env.LIVROS_TABLE_NAME = 'livraria-tb-livros-test';
});

describe('POST /backoffice/livros', () => {
  const validBody = {
    title: 'O Capital',
    description: 'Par 1.\n\nPar 2.',
    price: 5000,
    social_price: 3500,
    author: 'Karl Marx',
    pages: 300,
    edition: '2ª',
    year: 2024,
    format: '14x21cm',
  };

  it('retorna 401 sem JWT (mesmo com api key)', async () => {
    const res = await app.request('/backoffice/livros', {
      method: 'POST',
      body: JSON.stringify(validBody),
      headers: { 'x-api-key': 'chave-front', 'content-type': 'application/json' },
    });
    expect(res.status).toBe(401);
  });

  it('retorna 401 sem api key (mesmo com JWT)', async () => {
    const headers = await authHeaders();
    delete headers['x-api-key'];
    const res = await app.request('/backoffice/livros', {
      method: 'POST',
      body: JSON.stringify(validBody),
      headers,
    });
    expect(res.status).toBe(401);
  });

  it('cria livro com id uuid e timestamps, gravando na tabela do env', async () => {
    ddbMock.on(PutCommand).resolves({});

    const res = await app.request('/backoffice/livros', {
      method: 'POST',
      body: JSON.stringify(validBody),
      headers: await authHeaders(),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body).toMatchObject(validBody);
    expect(body.created_at).toBeTruthy();
    expect(body.updated_at).toBeTruthy();

    const calls = ddbMock.commandCalls(PutCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].input.TableName).toBe('livraria-tb-livros-test');
  });

  it('retorna 400 quando faltam campos obrigatórios (title, price)', async () => {
    const res = await app.request('/backoffice/livros', {
      method: 'POST',
      body: JSON.stringify({ title: 'Sem preço' }),
      headers: await authHeaders(),
    });
    expect(res.status).toBe(400);
  });

  it('cria livro sem descrição (campo opcional)', async () => {
    ddbMock.on(PutCommand).resolves({});

    const res = await app.request('/backoffice/livros', {
      method: 'POST',
      body: JSON.stringify({ title: 'Só título e preço', price: 1000, social_price: 800 }),
      headers: await authHeaders(),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty('description');
  });

  it('retorna 400 quando price não é inteiro (centavos)', async () => {
    const res = await app.request('/backoffice/livros', {
      method: 'POST',
      body: JSON.stringify({ ...validBody, price: 49.9 }),
      headers: await authHeaders(),
    });
    expect(res.status).toBe(400);
  });

  it('retorna 400 sem social_price (obrigatório) e quando social_price é inválido', async () => {
    const semSocial = { ...validBody } as Record<string, unknown>;
    delete semSocial.social_price;
    const res1 = await app.request('/backoffice/livros', {
      method: 'POST',
      body: JSON.stringify(semSocial),
      headers: await authHeaders(),
    });
    expect(res1.status).toBe(400);

    const res2 = await app.request('/backoffice/livros', {
      method: 'POST',
      body: JSON.stringify({ ...validBody, social_price: 35.5 }),
      headers: await authHeaders(),
    });
    expect(res2.status).toBe(400);
  });
});

describe('PUT /backoffice/livros/:id', () => {
  it('atualiza campos parciais e retorna o livro atualizado', async () => {
    ddbMock.on(UpdateCommand).resolves({
      Attributes: { id: 'b1', title: 'Novo título', price: 6000 },
    });

    const res = await app.request('/backoffice/livros/b1', {
      method: 'PUT',
      body: JSON.stringify({ title: 'Novo título', price: 6000 }),
      headers: await authHeaders(),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: 'b1', title: 'Novo título' });

    const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
    expect(input.TableName).toBe('livraria-tb-livros-test');
    expect(input.ConditionExpression).toContain('attribute_exists');
  });

  it('retorna 400 quando social_price do PUT é inválido', async () => {
    const res = await app.request('/backoffice/livros/b1', {
      method: 'PUT',
      body: JSON.stringify({ social_price: -1 }),
      headers: await authHeaders(),
    });
    expect(res.status).toBe(400);
  });

  it('retorna 404 quando o livro não existe', async () => {
    ddbMock.on(UpdateCommand).rejects(
      new ConditionalCheckFailedException({ $metadata: {}, message: 'nope' }),
    );

    const res = await app.request('/backoffice/livros/nao-existe', {
      method: 'PUT',
      body: JSON.stringify({ title: 'x' }),
      headers: await authHeaders(),
    });
    expect(res.status).toBe(404);
  });

  it('retorna 400 quando o body não tem nenhum campo atualizável', async () => {
    const res = await app.request('/backoffice/livros/b1', {
      method: 'PUT',
      body: JSON.stringify({ campo_desconhecido: 1 }),
      headers: await authHeaders(),
    });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /backoffice/livros/:id (segmentado por chave admin)', () => {
  it('deleta e retorna 204 com JWT + x-admin-api-key corretos', async () => {
    ddbMock.on(DeleteCommand).resolves({});

    const res = await app.request('/backoffice/livros/b1', {
      method: 'DELETE',
      headers: { ...(await authHeaders()), 'x-admin-api-key': 'chave-admin' },
    });

    expect(res.status).toBe(204);
    const input = ddbMock.commandCalls(DeleteCommand)[0].args[0].input;
    expect(input.TableName).toBe('livraria-tb-livros-test');
    expect(input.Key).toEqual({ id: 'b1' });
  });

  it('retorna 401 sem x-admin-api-key (mesmo com JWT válido)', async () => {
    const res = await app.request('/backoffice/livros/b1', {
      method: 'DELETE',
      headers: await authHeaders(),
    });
    expect(res.status).toBe(401);
  });

  it('retorna 401 com x-admin-api-key incorreta', async () => {
    const res = await app.request('/backoffice/livros/b1', {
      method: 'DELETE',
      headers: { ...(await authHeaders()), 'x-admin-api-key': 'errada' },
    });
    expect(res.status).toBe(401);
  });

  it('retorna 401 sem JWT', async () => {
    const res = await app.request('/backoffice/livros/b1', {
      method: 'DELETE',
      headers: { 'x-api-key': 'chave-front', 'x-admin-api-key': 'chave-admin' },
    });
    expect(res.status).toBe(401);
  });
});
