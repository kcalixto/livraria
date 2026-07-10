import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { app } from '../app';

const ddbMock = mockClient(DynamoDBDocumentClient);
const KEY_HEADER = { 'x-api-key': 'chave-secreta', 'content-type': 'application/json' };

beforeEach(() => {
  ddbMock.reset();
  process.env.LIVRARIA_BACKOFFICE_API_KEY = 'chave-secreta';
  process.env.LIVROS_TABLE_NAME = 'livraria-tb-livros-test';
});

describe('POST /backoffice/livros', () => {
  const validBody = {
    title: 'O Capital',
    description: 'Par 1.\n\nPar 2.',
    price: 5000,
    author: 'Karl Marx',
    pages: 300,
    edition: '2ª',
    year: 2024,
    format: '14x21cm',
  };

  it('retorna 401 sem api key', async () => {
    const res = await app.request('/backoffice/livros', {
      method: 'POST',
      body: JSON.stringify(validBody),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(401);
  });

  it('cria livro com id uuid e timestamps, gravando na tabela do env', async () => {
    ddbMock.on(PutCommand).resolves({});

    const res = await app.request('/backoffice/livros', {
      method: 'POST',
      body: JSON.stringify(validBody),
      headers: KEY_HEADER,
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

  it('retorna 400 quando faltam campos obrigatórios (title, description, price)', async () => {
    const res = await app.request('/backoffice/livros', {
      method: 'POST',
      body: JSON.stringify({ title: 'Sem preço' }),
      headers: KEY_HEADER,
    });
    expect(res.status).toBe(400);
  });

  it('retorna 400 quando price não é inteiro (centavos)', async () => {
    const res = await app.request('/backoffice/livros', {
      method: 'POST',
      body: JSON.stringify({ ...validBody, price: 49.9 }),
      headers: KEY_HEADER,
    });
    expect(res.status).toBe(400);
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
      headers: KEY_HEADER,
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: 'b1', title: 'Novo título' });

    const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
    expect(input.TableName).toBe('livraria-tb-livros-test');
    expect(input.ConditionExpression).toContain('attribute_exists');
  });

  it('retorna 404 quando o livro não existe', async () => {
    ddbMock.on(UpdateCommand).rejects(
      new ConditionalCheckFailedException({ $metadata: {}, message: 'nope' }),
    );

    const res = await app.request('/backoffice/livros/nao-existe', {
      method: 'PUT',
      body: JSON.stringify({ title: 'x' }),
      headers: KEY_HEADER,
    });
    expect(res.status).toBe(404);
  });

  it('retorna 400 quando o body não tem nenhum campo atualizável', async () => {
    const res = await app.request('/backoffice/livros/b1', {
      method: 'PUT',
      body: JSON.stringify({ campo_desconhecido: 1 }),
      headers: KEY_HEADER,
    });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /backoffice/livros/:id', () => {
  it('deleta e retorna 204', async () => {
    ddbMock.on(DeleteCommand).resolves({});

    const res = await app.request('/backoffice/livros/b1', {
      method: 'DELETE',
      headers: { 'x-api-key': 'chave-secreta' },
    });

    expect(res.status).toBe(204);
    const input = ddbMock.commandCalls(DeleteCommand)[0].args[0].input;
    expect(input.TableName).toBe('livraria-tb-livros-test');
    expect(input.Key).toEqual({ id: 'b1' });
  });

  it('retorna 401 sem api key', async () => {
    const res = await app.request('/backoffice/livros/b1', { method: 'DELETE' });
    expect(res.status).toBe(401);
  });
});
