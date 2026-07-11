import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { app } from '../app';
import { BOOK_STATUS_AVAILABLE } from '../lib/stock-mock';

const ddbMock = mockClient(DynamoDBDocumentClient);

const KEY_HEADER = { 'x-api-key': 'chave-front' };

beforeEach(() => {
  ddbMock.reset();
  process.env.LIVRARIA_FRONT_END_API_KEY = 'chave-front';
  process.env.LIVROS_TABLE_NAME = 'livraria-tb-livros-test';
});

describe('GET /livros', () => {
  it('retorna lista vazia quando a tabela está vazia', async () => {
    ddbMock.on(ScanCommand).resolves({ Items: [] });

    const res = await app.request('/livros', { headers: KEY_HEADER });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('faz Scan na tabela do env LIVROS_TABLE_NAME', async () => {
    ddbMock.on(ScanCommand).resolves({ Items: [] });

    await app.request('/livros', { headers: KEY_HEADER });

    const calls = ddbMock.commandCalls(ScanCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].input.TableName).toBe('livraria-tb-livros-test');
  });

  it('retorna livros com amount e status, sem campo de imagem (capa é resolvida no front)', async () => {
    ddbMock.on(ScanCommand).resolves({
      Items: [
        {
          id: 'b1',
          title: 'O Capital',
          description: 'Par 1.\n\nPar 2.',
          price: 5000,
          author: 'Karl Marx',
        },
      ],
    });

    const res = await app.request('/livros', { headers: KEY_HEADER });
    const body = (await res.json()) as Array<Record<string, unknown>>;

    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      id: 'b1',
      title: 'O Capital',
      description: 'Par 1.\n\nPar 2.',
      price: 5000,
      author: 'Karl Marx',
      status: BOOK_STATUS_AVAILABLE,
    });
    expect(body[0]).not.toHaveProperty('image_url');
    const amount = body[0].amount as number;
    expect(Number.isInteger(amount)).toBe(true);
    expect(amount).toBeGreaterThanOrEqual(0);
    expect(amount).toBeLessThanOrEqual(10);
  });
});
