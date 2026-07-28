import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { app } from '../app';

const ddbMock = mockClient(DynamoDBDocumentClient);

const KEY_HEADER = { 'x-api-key': 'chave-front' };
const REGION = 'SP, Capital - Zona Sul';

beforeEach(() => {
  ddbMock.reset();
  process.env.LIVRARIA_FRONT_END_API_KEY = 'chave-front';
  process.env.LIVROS_TABLE_NAME = 'livraria-tb-livros-test';
  process.env.LOTES_TABLE_NAME = 'livraria-tb-lotes-test';
  process.env.PEDIDOS_TABLE_NAME = 'livraria-tb-pedidos-test';
  // default: sem lotes e sem pedidos
  ddbMock.on(ScanCommand, { TableName: 'livraria-tb-lotes-test' }).resolves({ Items: [] });
  ddbMock.on(ScanCommand, { TableName: 'livraria-tb-pedidos-test' }).resolves({ Items: [] });
});

describe('GET /livros', () => {
  it('retorna lista vazia quando a tabela está vazia', async () => {
    ddbMock.on(ScanCommand, { TableName: 'livraria-tb-livros-test' }).resolves({ Items: [] });

    const res = await app.request('/livros', { headers: KEY_HEADER });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('expõe o slug do livro (o front monta o caminho da capa com ele)', async () => {
    ddbMock.on(ScanCommand, { TableName: 'livraria-tb-livros-test' }).resolves({
      Items: [{ id: 'b1', title: 'A Comuna e o Fogo', price: 100, slug: 'a-comuna-e-o-fogo' }],
    });

    const res = await app.request('/livros', { headers: KEY_HEADER });
    const body = (await res.json()) as Array<{ slug: string }>;

    expect(body[0].slug).toBe('a-comuna-e-o-fogo');
  });

  it('ordena por created_at descendente (mais novos primeiro)', async () => {
    ddbMock.on(ScanCommand, { TableName: 'livraria-tb-livros-test' }).resolves({
      Items: [
        { id: 'antigo', title: 'Antigo', price: 100, created_at: '2026-07-01T10:00:00.000Z' },
        { id: 'novo', title: 'Novo', price: 100, created_at: '2026-07-11T10:00:00.000Z' },
        { id: 'meio', title: 'Meio', price: 100, created_at: '2026-07-05T10:00:00.000Z' },
      ],
    });

    const res = await app.request('/livros', { headers: KEY_HEADER });
    const body = (await res.json()) as Array<{ id: string }>;

    expect(body.map((b) => b.id)).toEqual(['novo', 'meio', 'antigo']);
  });

  it('amount é o estoque REAL da região (lotes menos deduções); sem lote = 0', async () => {
    ddbMock.on(ScanCommand, { TableName: 'livraria-tb-livros-test' }).resolves({
      Items: [
        { id: 'b1', title: 'Com Lote', price: 5000 },
        { id: 'b2', title: 'Sem Lote', price: 3000 },
      ],
    });
    ddbMock.on(ScanCommand, { TableName: 'livraria-tb-lotes-test' }).resolves({
      Items: [
        {
          id: 'lote-a',
          date: '2026-07-01',
          region: REGION,
          books: [{ book_id: 'b1', amount: 4 }],
          total_cost: 1000,
        },
      ],
    });
    ddbMock.on(ScanCommand, { TableName: 'livraria-tb-pedidos-test' }).resolves({
      Items: [
        {
          id: 'PED1',
          region: REGION,
          unit_id: 'u1',
          title_id: 'b1',
          status: 'in-reserve',
          lote_id: 'lote-a',
        },
      ],
    });

    const res = await app.request('/livros', { headers: KEY_HEADER });
    const body = (await res.json()) as Array<Record<string, unknown>>;

    const comLote = body.find((b) => b.id === 'b1')!;
    const semLote = body.find((b) => b.id === 'b2')!;
    expect(comLote.amount).toBe(3); // 4 adquiridos − 1 reservado
    expect(semLote.amount).toBe(0); // esgotado: nunca entrou em lote
    expect(comLote).not.toHaveProperty('image_url');
  });

  it('não retorna livros arquivados (state=archived); sem state = ativo', async () => {
    ddbMock.on(ScanCommand, { TableName: 'livraria-tb-livros-test' }).resolves({
      Items: [
        { id: 'ativo', title: 'Ativo Explícito', price: 100, state: 'active' },
        { id: 'arquivado', title: 'Arquivado', price: 100, state: 'archived' },
        { id: 'legado', title: 'Legado Sem State', price: 100 },
      ],
    });

    const res = await app.request('/livros', { headers: KEY_HEADER });
    const body = (await res.json()) as Array<{ id: string }>;

    expect(body.map((b) => b.id).sort()).toEqual(['ativo', 'legado']);
  });

  it('?state=all retorna também os arquivados (backoffice e consulta de pedido)', async () => {
    ddbMock.on(ScanCommand, { TableName: 'livraria-tb-livros-test' }).resolves({
      Items: [
        { id: 'ativo', title: 'Ativo', price: 100, state: 'active' },
        { id: 'arquivado', title: 'Arquivado', price: 100, state: 'archived' },
      ],
    });

    const res = await app.request('/livros?state=all', { headers: KEY_HEADER });
    const body = (await res.json()) as Array<{ id: string }>;

    expect(body.map((b) => b.id).sort()).toEqual(['arquivado', 'ativo']);
  });

  it('amount da vitrine desconta também pedidos aguardando pagamento', async () => {
    ddbMock.on(ScanCommand, { TableName: 'livraria-tb-livros-test' }).resolves({
      Items: [{ id: 'b1', title: 'Com Lote', price: 5000 }],
    });
    ddbMock.on(ScanCommand, { TableName: 'livraria-tb-lotes-test' }).resolves({
      Items: [
        {
          id: 'lote-a',
          date: '2026-07-01',
          region: REGION,
          books: [{ book_id: 'b1', amount: 4 }],
          total_cost: 1000,
        },
      ],
    });
    const waiting = (unitId: string) => ({
      id: 'PED1',
      region: REGION,
      unit_id: unitId,
      title_id: 'b1',
      status: 'waiting-payment',
    });
    ddbMock
      .on(ScanCommand, { TableName: 'livraria-tb-pedidos-test' })
      .resolves({ Items: [waiting('u1'), waiting('u2'), waiting('u3')] });

    const res = await app.request('/livros', { headers: KEY_HEADER });
    const body = (await res.json()) as Array<Record<string, unknown>>;

    // 4 adquiridos, 3 presos em pedido não pago → sobra 1 pra vender
    expect(body[0].amount).toBe(1);
  });
});
