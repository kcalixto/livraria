import { Hono } from 'hono';
import { DeleteCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { docClient } from '../lib/db';
import { adminApiKeyMiddleware } from '../middlewares/admin-api-key';
import { jwtMiddleware } from '../middlewares/jwt';

const REQUIRED_FIELDS = ['title', 'price'] as const;
const OPTIONAL_FIELDS = ['description', 'author', 'pages', 'edition', 'year', 'format'] as const;
const ALL_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];

function invalidPrice(price: unknown): boolean {
  return typeof price !== 'number' || !Number.isInteger(price) || price < 0;
}

export const backofficeLivros = new Hono();

backofficeLivros.use('*', jwtMiddleware);

backofficeLivros.post('/', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'invalid json' }, 400);

  const missing = REQUIRED_FIELDS.filter((f) => body[f] === undefined || body[f] === '');
  if (missing.length > 0) {
    return c.json({ error: `missing fields: ${missing.join(', ')}` }, 400);
  }
  if (invalidPrice(body.price)) {
    return c.json({ error: 'price must be a non-negative integer (cents)' }, 400);
  }

  const now = new Date().toISOString();
  const book: Record<string, unknown> = {
    id: crypto.randomUUID(),
    created_at: now,
    updated_at: now,
  };
  for (const field of ALL_FIELDS) {
    if (body[field] !== undefined) book[field] = body[field];
  }

  await docClient.send(
    new PutCommand({ TableName: process.env.LIVROS_TABLE_NAME, Item: book }),
  );
  return c.json(book, 201);
});

backofficeLivros.put('/:id', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'invalid json' }, 400);

  const updates = ALL_FIELDS.filter((f) => body[f] !== undefined);
  if (updates.length === 0) {
    return c.json({ error: 'no updatable fields in body' }, 400);
  }
  if (body.price !== undefined && invalidPrice(body.price)) {
    return c.json({ error: 'price must be a non-negative integer (cents)' }, 400);
  }

  const setParts = updates.map((f) => `#${f} = :${f}`);
  const names = Object.fromEntries(updates.map((f) => [`#${f}`, f]));
  const values = Object.fromEntries(updates.map((f) => [`:${f}`, body[f]]));

  try {
    const result = await docClient.send(
      new UpdateCommand({
        TableName: process.env.LIVROS_TABLE_NAME,
        Key: { id: c.req.param('id') },
        ConditionExpression: 'attribute_exists(id)',
        UpdateExpression: `SET ${setParts.join(', ')}, updated_at = :updated_at`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: { ...values, ':updated_at': new Date().toISOString() },
        ReturnValues: 'ALL_NEW',
      }),
    );
    return c.json(result.Attributes);
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      return c.json({ error: 'not found' }, 404);
    }
    throw err;
  }
});

backofficeLivros.delete('/:id', adminApiKeyMiddleware, async (c) => {
  await docClient.send(
    new DeleteCommand({
      TableName: process.env.LIVROS_TABLE_NAME,
      Key: { id: c.req.param('id') },
    }),
  );
  return c.body(null, 204);
});
