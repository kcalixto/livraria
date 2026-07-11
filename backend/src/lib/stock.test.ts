import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { computeStock } from './stock';

const ddbMock = mockClient(DynamoDBDocumentClient);

const REGION = 'SP, Capital - Zona Sul';

const lotes = [
  {
    id: 'lote-antigo',
    date: '2026-07-01',
    region: REGION,
    books: [
      { book_id: 'b1', amount: 3 },
      { book_id: 'b2', amount: 1 },
    ],
    total_cost: 10000,
  },
  {
    id: 'lote-novo',
    date: '2026-07-10',
    region: REGION,
    books: [{ book_id: 'b1', amount: 2 }],
    total_cost: 6000,
  },
  {
    id: 'lote-outra-regiao',
    date: '2026-07-02',
    region: 'Grande ABC',
    books: [{ book_id: 'b1', amount: 9 }],
    total_cost: 1000,
  },
];

const unit = (over: Record<string, unknown>) => ({
  id: 'PED001',
  region: REGION,
  status: 'waiting-payment',
  ...over,
});

const pedidos = [
  // waiting sem retirada: NÃO deduz
  unit({ unit_id: 'u1', title_id: 'b1' }),
  // reservada no lote antigo: deduz como reserved
  unit({ unit_id: 'u2', title_id: 'b1', status: 'in-reserve', lote_id: 'lote-antigo' }),
  // paga no lote antigo: sold com valor recebido
  unit({
    unit_id: 'u3',
    title_id: 'b1',
    status: 'payment-received',
    lote_id: 'lote-antigo',
    received_amount: 5500,
  }),
  // retirada sem pagamento (waiting) no lote novo: deduz como picked_up
  unit({ unit_id: 'u4', title_id: 'b1', picked_up: true, lote_id: 'lote-novo' }),
  // retirada E paga: sold
  unit({
    unit_id: 'u5',
    title_id: 'b2',
    status: 'payment-received',
    picked_up: true,
    lote_id: 'lote-antigo',
    received_amount: 2000,
  }),
  // outra região: ignorada no cômputo desta região
  unit({ unit_id: 'u6', title_id: 'b1', status: 'received', region: 'Grande ABC', lote_id: 'lote-outra-regiao' }),
];

beforeEach(() => {
  ddbMock.reset();
  process.env.LOTES_TABLE_NAME = 'livraria-tb-lotes-test';
  process.env.PEDIDOS_TABLE_NAME = 'livraria-tb-pedidos-test';
  ddbMock
    .on(ScanCommand, { TableName: 'livraria-tb-lotes-test' })
    .resolves({ Items: lotes });
  ddbMock
    .on(ScanCommand, { TableName: 'livraria-tb-pedidos-test' })
    .resolves({ Items: pedidos });
});

describe('computeStock', () => {
  it('calcula o saldo por título na região (waiting não deduz)', async () => {
    const stock = await computeStock(REGION);

    // b1: adquirido 3+2=5; reservado 1 (u2); retirado 1 (u4); vendido 1 (u3)
    expect(stock.titles['b1']).toEqual({
      acquired: 5,
      reserved: 1,
      picked_up: 1,
      sold: 1,
      available: 2,
    });
    // b2: adquirido 1; vendido 1 (u5 retirada+paga conta como sold)
    expect(stock.titles['b2']).toEqual({
      acquired: 1,
      reserved: 0,
      picked_up: 0,
      sold: 1,
      available: 0,
    });
  });

  it('agrega por lote: contagens, restante e valor vendido', async () => {
    const stock = await computeStock(REGION);

    const antigo = stock.lotes['lote-antigo'];
    // b1 no lote antigo: adquirido 3, reservado 1 (u2), vendido 1 (u3) → restam 1
    expect(antigo.books['b1']).toMatchObject({
      acquired: 3,
      reserved: 1,
      picked_up: 0,
      sold: 1,
      remaining: 1,
    });
    // b2 no lote antigo: adquirido 1, vendido 1 (u5) → restam 0
    expect(antigo.books['b2']).toMatchObject({ acquired: 1, sold: 1, remaining: 0 });
    // vendido em R$ do lote antigo = 5500 (u3) + 2000 (u5)
    expect(antigo.sold_value).toBe(7500);

    const novo = stock.lotes['lote-novo'];
    expect(novo.books['b1']).toMatchObject({
      acquired: 2,
      picked_up: 1,
      remaining: 1,
    });
    expect(novo.sold_value).toBe(0);
  });

  it('lotes de outra região ficam fora do resultado', async () => {
    const stock = await computeStock(REGION);
    expect(stock.lotes['lote-outra-regiao']).toBeUndefined();
  });

  it('expõe os lotes da região ordenados por data (FIFO: mais antigo primeiro)', async () => {
    const stock = await computeStock(REGION);
    expect(stock.fifo.map((l) => l.id)).toEqual(['lote-antigo', 'lote-novo']);
  });
});
