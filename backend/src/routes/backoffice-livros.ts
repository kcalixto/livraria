import { Hono } from 'hono';
import { DeleteCommand, PutCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { docClient } from '../lib/db';
import { slugify } from '../lib/slug';
import { adminApiKeyMiddleware } from '../middlewares/admin-api-key';
import { jwtMiddleware } from '../middlewares/jwt';
import { requireRole } from '../middlewares/require-role';

// social_price: preço pra quem não pode pagar o cheio (regra da livraria social)
const REQUIRED_FIELDS = ['title', 'price', 'social_price'] as const;
const OPTIONAL_FIELDS = ['description', 'author', 'pages', 'edition', 'year', 'format'] as const;
const ALL_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];

function invalidPrice(price: unknown): boolean {
  return typeof price !== 'number' || !Number.isInteger(price) || price < 0;
}

// Slug derivado do título, único no acervo. O Scan projeta só id+slug e o
// acervo tem dezenas de livros — cabe folgado numa página (limite de 1MB).
// Corrida entre dois POSTs simultâneos poderia repetir um slug; a livraria
// opera com um admin, e o efeito (duas capas com o mesmo arquivo) aparece na
// hora na tela Livros. Unicidade de verdade exigiria tabela auxiliar.
async function uniqueSlug(title: string, selfId?: string): Promise<string> {
  const base = slugify(title);
  const result = await docClient.send(
    new ScanCommand({
      TableName: process.env.LIVROS_TABLE_NAME,
      ProjectionExpression: 'id, slug',
    }),
  );
  const taken = new Set(
    (result.Items ?? [])
      .filter((item) => item.id !== selfId) // editar o próprio livro não colide
      .map((item) => item.slug as string),
  );
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export const backofficeLivros = new Hono();

backofficeLivros.use('*', jwtMiddleware);

backofficeLivros.post('/', requireRole('admin'), async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'invalid json' }, 400);

  const missing = REQUIRED_FIELDS.filter((f) => body[f] === undefined || body[f] === '');
  if (missing.length > 0) {
    return c.json({ error: `missing fields: ${missing.join(', ')}` }, 400);
  }
  if (invalidPrice(body.price)) {
    return c.json({ error: 'price must be a non-negative integer (cents)' }, 400);
  }
  if (invalidPrice(body.social_price)) {
    return c.json({ error: 'social_price must be a non-negative integer (cents)' }, 400);
  }

  const now = new Date().toISOString();
  const book: Record<string, unknown> = {
    id: crypto.randomUUID(),
    // fora de ALL_FIELDS de propósito: o cliente nunca escolhe o slug (o loop
    // abaixo só copia campos conhecidos, então body.slug é ignorado)
    slug: await uniqueSlug(body.title),
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

backofficeLivros.put('/:id', requireRole('admin'), async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'invalid json' }, 400);

  const updates = ALL_FIELDS.filter((f) => body[f] !== undefined);
  if (updates.length === 0) {
    return c.json({ error: 'no updatable fields in body' }, 400);
  }
  if (body.price !== undefined && invalidPrice(body.price)) {
    return c.json({ error: 'price must be a non-negative integer (cents)' }, 400);
  }
  if (body.social_price !== undefined && invalidPrice(body.social_price)) {
    return c.json({ error: 'social_price must be a non-negative integer (cents)' }, 400);
  }

  const setParts: string[] = updates.map((f) => `#${f} = :${f}`);
  const names: Record<string, string> = Object.fromEntries(
    updates.map((f) => [`#${f}`, f]),
  );
  const values: Record<string, unknown> = Object.fromEntries(
    updates.map((f) => [`:${f}`, body[f]]),
  );

  // título mudou = slug muda junto (e o arquivo da capa precisa ser renomeado
  // no repo — o form avisa). Sem o selfId o livro colidiria consigo mesmo.
  if (body.title !== undefined) {
    setParts.push('#slug = :slug');
    names['#slug'] = 'slug';
    values[':slug'] = await uniqueSlug(body.title, c.req.param('id'));
  }

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

backofficeLivros.delete('/:id', requireRole('admin'), adminApiKeyMiddleware, async (c) => {
  await docClient.send(
    new DeleteCommand({
      TableName: process.env.LIVROS_TABLE_NAME,
      Key: { id: c.req.param('id') },
    }),
  );
  return c.body(null, 204);
});
