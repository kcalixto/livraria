import { Hono } from 'hono';
import { BatchWriteCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../lib/db';
import { isUnitFinalized, ORDER_STATUS_WAITING_PAYMENT } from '../lib/order-status';

const ORDER_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const ORDER_CODE_LENGTH = 6;
const MAX_CODE_ATTEMPTS = 5;

function generateOrderCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ORDER_CODE_LENGTH));
  return [...bytes].map((b) => ORDER_CODE_CHARS[b % ORDER_CODE_CHARS.length]).join('');
}

// Código curto colide de vez em quando (36^6 combinações): checa existência
// antes de gravar, senão o BatchWrite misturaria dois pedidos no mesmo id.
async function uniqueOrderCode(): Promise<string | null> {
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const code = generateOrderCode();
    const existing = await docClient.send(
      new QueryCommand({
        TableName: process.env.PEDIDOS_TABLE_NAME,
        KeyConditionExpression: 'id = :id',
        ExpressionAttributeValues: { ':id': code },
        Limit: 1,
      }),
    );
    if ((existing.Items ?? []).length === 0) return code;
  }
  return null;
}

interface OrderItemInput {
  book_id: string;
  amount: number;
}

function parseItems(items: unknown): OrderItemInput[] | null {
  if (!Array.isArray(items) || items.length === 0) return null;
  const byBook = new Map<string, number>();
  for (const item of items) {
    const bookId = (item as OrderItemInput)?.book_id;
    const amount = (item as OrderItemInput)?.amount;
    if (typeof bookId !== 'string' || bookId === '') return null;
    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 1) return null;
    byBook.set(bookId, (byBook.get(bookId) ?? 0) + amount);
  }
  return [...byBook.entries()].map(([book_id, amount]) => ({ book_id, amount }));
}

export const pedidos = new Hono();

pedidos.post('/', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'invalid json' }, 400);

  for (const field of ['name', 'contact', 'region'] as const) {
    if (typeof body[field] !== 'string' || body[field].trim() === '') {
      return c.json({ error: `${field} is required` }, 400);
    }
  }
  const items = parseItems(body.items);
  if (!items) {
    return c.json(
      { error: 'items must be a non-empty list with book_id and integer amount >= 1' },
      400,
    );
  }

  const id = await uniqueOrderCode();
  if (!id) return c.json({ error: 'could not allocate order code, try again' }, 503);
  const now = new Date().toISOString();

  // 1 linha por UNIDADE física: a venda é por título/unidade; o pedido é só
  // o agrupador de entrega. Range key composta title_id#unit_id.
  const puts = items.flatMap(({ book_id, amount }) =>
    Array.from({ length: amount }, () => {
      const unitId = crypto.randomUUID();
      return {
        PutRequest: {
          Item: {
            id,
            book_id: `${book_id}#${unitId}`,
            title_id: book_id,
            unit_id: unitId,
            name: body.name,
            contact: body.contact,
            region: body.region,
            status: ORDER_STATUS_WAITING_PAYMENT,
            created_at: now,
            updated_at: now,
          },
        },
      };
    }),
  );

  const BATCH_SIZE = 25; // limite do BatchWrite do DynamoDB
  for (let i = 0; i < puts.length; i += BATCH_SIZE) {
    await docClient.send(
      new BatchWriteCommand({
        RequestItems: { [process.env.PEDIDOS_TABLE_NAME!]: puts.slice(i, i + BATCH_SIZE) },
      }),
    );
  }

  return c.json({ id }, 201);
});

function normalizeCode(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

async function queryOrderLines(id: string) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: process.env.PEDIDOS_TABLE_NAME,
      KeyConditionExpression: 'id = :id',
      ExpressionAttributeValues: { ':id': id },
    }),
  );
  return result.Items ?? [];
}

// Consulta pública por código: o código de 6 chars é a única credencial,
// então a resposta NÃO expõe name/contact nem valores — só status, observação
// e o unit_id (endereço do item pra solicitar cancelamento).
pedidos.get('/:id', async (c) => {
  const id = normalizeCode(c.req.param('id'));

  const lines = await queryOrderLines(id);
  if (lines.length === 0) return c.json({ error: 'not found' }, 404);

  const items = lines.map((line) => {
    const item: Record<string, unknown> = {
      unit_id: line.unit_id,
      title_id: line.title_id,
      status: line.status,
    };
    if (line.picked_up !== undefined) item.picked_up = line.picked_up;
    if (line.observation !== undefined) item.observation = line.observation;
    if (line.cancel_requested !== undefined) item.cancel_requested = line.cancel_requested;
    return item;
  });

  return c.json({ id, created_at: lines[0].created_at, items });
});

// Solicitação de cancelamento por item: NÃO cancela — marca a unidade pro
// operador decidir no backoffice.
pedidos.post('/:id/cancelamento', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.unit_id !== 'string' || body.unit_id === '') {
    return c.json({ error: 'unit_id is required' }, 400);
  }

  const id = normalizeCode(c.req.param('id'));
  const lines = await queryOrderLines(id);
  if (lines.length === 0) return c.json({ error: 'not found' }, 404);

  const line = lines.find((item) => item.unit_id === body.unit_id);
  if (!line) return c.json({ error: 'not found' }, 404);
  if (line.status === 'cancelled' || isUnitFinalized(line)) {
    return c.json({ error: 'unit is finalized or already cancelled' }, 400);
  }
  if (line.cancel_requested === true) {
    return c.json({ error: 'cancellation already requested' }, 400);
  }

  await docClient.send(
    new UpdateCommand({
      TableName: process.env.PEDIDOS_TABLE_NAME,
      Key: { id, book_id: line.book_id },
      // não toca updated_at: a data de finalização é do fluxo de venda
      UpdateExpression:
        'SET cancel_requested = :cancel_requested, cancel_requested_at = :cancel_requested_at',
      ExpressionAttributeValues: {
        ':cancel_requested': true,
        ':cancel_requested_at': new Date().toISOString(),
      },
    }),
  );
  return c.json({ id, unit_id: body.unit_id, cancel_requested: true });
});
