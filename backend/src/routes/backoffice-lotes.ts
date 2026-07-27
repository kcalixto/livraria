import { Hono } from 'hono';
import { PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { docClient } from '../lib/db';
import { s3Client } from '../lib/s3';
import { DEFAULT_REGION } from '../lib/constants';
import { computeStock } from '../lib/stock';
import { stripControlChars } from '../lib/sanitize';
import { jwtMiddleware } from '../middlewares/jwt';
import { requireRole } from '../middlewares/require-role';

const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

// comprovante pix: png, jpg ou pdf, validados pelos magic bytes
const RECEIPT_TYPES: Record<string, { magic: Buffer; contentType: string }> = {
  png: { magic: Buffer.from([0x89, 0x50, 0x4e, 0x47]), contentType: 'image/png' },
  jpg: { magic: Buffer.from([0xff, 0xd8, 0xff]), contentType: 'image/jpeg' },
  pdf: { magic: Buffer.from('%PDF-'), contentType: 'application/pdf' },
};

interface LoteBookInput {
  book_id: string;
  amount: number;
}

function parseBooks(books: unknown): LoteBookInput[] | null {
  if (!Array.isArray(books) || books.length === 0) return null;
  const parsed: LoteBookInput[] = [];
  for (const book of books) {
    const bookId = (book as LoteBookInput)?.book_id;
    const amount = (book as LoteBookInput)?.amount;
    if (typeof bookId !== 'string' || bookId === '') return null;
    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 0) return null;
    // linha zerada é rascunho do form (o operador apagou pra redigitar): sai
    // do lote em vez de derrubar o cadastro inteiro
    if (amount === 0) continue;
    parsed.push({ book_id: bookId, amount });
  }
  return parsed.length > 0 ? parsed : null;
}

// observação do lote: texto curto de contexto da compra, opcional
const MAX_LOTE_OBSERVATION_CHARS = 200;

type ObservationResult = { error: string } | { observation: string };

// valida o tamanho ANTES do trim (limite é sobre o payload cru) e devolve o
// texto limpo; string vazia significa "remover"
function parseObservation(value: unknown): ObservationResult {
  if (typeof value !== 'string' || value.length > MAX_LOTE_OBSERVATION_CHARS) {
    return { error: `observation must be a string of at most ${MAX_LOTE_OBSERVATION_CHARS} characters` };
  }
  return { observation: stripControlChars(value).trim() };
}

export const backofficeLotes = new Hono();

backofficeLotes.use('*', jwtMiddleware);

backofficeLotes.post('/', requireRole('admin'), async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'invalid json' }, 400);

  if (typeof body.date !== 'string' || body.date.trim() === '') {
    return c.json({ error: 'date is required' }, 400);
  }
  if (typeof body.region !== 'string' || body.region.trim() === '') {
    return c.json({ error: 'region is required' }, 400);
  }
  const books = parseBooks(body.books);
  if (!books) {
    return c.json(
      { error: 'books must be a non-empty list with book_id and integer amount >= 1' },
      400,
    );
  }
  if (
    typeof body.total_cost !== 'number' ||
    !Number.isInteger(body.total_cost) ||
    body.total_cost < 0
  ) {
    return c.json({ error: 'total_cost must be a non-negative integer (cents)' }, 400);
  }

  let observation = '';
  if (body.observation !== undefined) {
    const parsed = parseObservation(body.observation);
    if ('error' in parsed) return c.json(parsed, 400);
    observation = parsed.observation;
  }

  const now = new Date().toISOString();
  const lote = {
    id: crypto.randomUUID(),
    date: body.date,
    region: body.region,
    books,
    total_cost: body.total_cost,
    ...(observation && { observation }), // vazia = nem grava o atributo
    created_at: now,
    updated_at: now,
  };

  await docClient.send(
    new PutCommand({ TableName: process.env.LOTES_TABLE_NAME, Item: lote }),
  );
  return c.json(lote, 201);
});

// Edição do lote: hoje só a observação (o resto do lote é histórico de compra
// e não se corrige por aqui). Vazia REMOVE o atributo.
backofficeLotes.patch('/:id', requireRole('admin'), async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || body.observation === undefined) {
    return c.json({ error: 'observation is required' }, 400);
  }
  const parsed = parseObservation(body.observation);
  if ('error' in parsed) return c.json(parsed, 400);
  const { observation } = parsed;

  try {
    const result = await docClient.send(
      new UpdateCommand({
        TableName: process.env.LOTES_TABLE_NAME,
        Key: { id: c.req.param('id') },
        ConditionExpression: 'attribute_exists(id)',
        UpdateExpression: observation
          ? 'SET #observation = :observation, updated_at = :updated_at'
          : 'SET updated_at = :updated_at REMOVE #observation',
        ExpressionAttributeNames: { '#observation': 'observation' },
        ExpressionAttributeValues: {
          ':updated_at': new Date().toISOString(),
          ...(observation && { ':observation': observation }),
        },
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

interface LoteTransaction {
  id: string;
  date: string;
  recipient: string;
  amount: number; // centavos com sinal: negativo = doação/perda, positivo = contribuição
  receipt_key?: string;
  created_at: string;
}

function transactionsOf(lote: Record<string, unknown>): LoteTransaction[] {
  return (lote.transactions as LoteTransaction[] | undefined) ?? [];
}

function transactionsTotal(lote: Record<string, unknown>): number {
  return transactionsOf(lote).reduce((sum, t) => sum + t.amount, 0);
}

backofficeLotes.get('/', requireRole('viewer', 'admin'), async (c) => {
  const region = c.req.query('region') ?? DEFAULT_REGION;
  const stock = await computeStock(region);

  const lotes = [...stock.fifo]
    .sort((a, b) => String(b.date).localeCompare(String(a.date))) // listagem: mais novo primeiro
    .map((lote) => ({
      ...lote,
      total_books: lote.books.reduce((sum, b) => sum + b.amount, 0),
      total_remaining: Object.values(stock.lotes[lote.id]?.books ?? {}).reduce(
        (sum, b) => sum + b.remaining,
        0,
      ),
      sold_value: stock.lotes[lote.id]?.sold_value ?? 0,
      transactions_total: transactionsTotal(lote),
    }));
  return c.json(lotes);
});

backofficeLotes.get('/:id', requireRole('viewer', 'admin'), async (c) => {
  const region = c.req.query('region') ?? DEFAULT_REGION;
  const stock = await computeStock(region);

  const lote = stock.fifo.find((l) => l.id === c.req.param('id'));
  if (!lote) return c.json({ error: 'not found' }, 404);

  const loteStock = stock.lotes[lote.id];
  return c.json({
    ...lote,
    sold_value: loteStock.sold_value,
    transactions: transactionsOf(lote),
    transactions_total: transactionsTotal(lote),
    books: lote.books.map(({ book_id }) => ({
      book_id,
      ...loteStock.books[book_id],
    })),
  });
});

backofficeLotes.post('/:id/transacoes', requireRole('admin'), async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'invalid json' }, 400);

  if (typeof body.date !== 'string' || body.date.trim() === '') {
    return c.json({ error: 'date is required' }, 400);
  }
  if (typeof body.recipient !== 'string' || body.recipient.trim() === '') {
    return c.json({ error: 'recipient is required' }, 400);
  }
  if (
    typeof body.amount !== 'number' ||
    !Number.isInteger(body.amount) ||
    body.amount === 0
  ) {
    return c.json({ error: 'amount must be a non-zero integer (signed cents)' }, 400);
  }

  let receipt: { buffer: Buffer; type: string } | null = null;
  if (body.receipt_base64) {
    const spec = RECEIPT_TYPES[String(body.receipt_type)];
    if (!spec) return c.json({ error: 'receipt_type must be png, jpg or pdf' }, 400);
    const buffer = Buffer.from(body.receipt_base64, 'base64');
    if (
      buffer.length < spec.magic.length ||
      !buffer.subarray(0, spec.magic.length).equals(spec.magic)
    ) {
      return c.json({ error: 'receipt content does not match receipt_type' }, 400);
    }
    if (buffer.length > MAX_RECEIPT_BYTES) {
      return c.json({ error: 'receipt must be at most 5MB' }, 400);
    }
    receipt = { buffer, type: String(body.receipt_type) };
  }

  const region = c.req.query('region') ?? DEFAULT_REGION;
  const stock = await computeStock(region);
  const lote = stock.fifo.find((l) => l.id === c.req.param('id'));
  if (!lote) return c.json({ error: 'not found' }, 404);

  const transaction: LoteTransaction = {
    id: crypto.randomUUID(),
    date: body.date,
    recipient: body.recipient.trim(),
    amount: body.amount,
    created_at: new Date().toISOString(),
  };

  if (receipt) {
    transaction.receipt_key = `${process.env.STAGE}/comprovantes/${lote.id}/${transaction.id}.${receipt.type}`;
    await s3Client.send(
      new PutObjectCommand({
        Bucket: process.env.ASSETS_S3_BUCKET_NAME,
        Key: transaction.receipt_key,
        Body: receipt.buffer,
        ContentType: RECEIPT_TYPES[receipt.type].contentType,
      }),
    );
  }

  await docClient.send(
    new UpdateCommand({
      TableName: process.env.LOTES_TABLE_NAME,
      Key: { id: lote.id },
      UpdateExpression:
        'SET transactions = list_append(if_not_exists(transactions, :empty), :tx), updated_at = :now',
      ExpressionAttributeValues: {
        ':tx': [transaction],
        ':empty': [],
        ':now': new Date().toISOString(),
      },
    }),
  );

  return c.json(transaction, 201);
});

backofficeLotes.get('/:id/transacoes/:txId/comprovante', requireRole('viewer', 'admin'), async (c) => {
  const region = c.req.query('region') ?? DEFAULT_REGION;
  const stock = await computeStock(region);
  const lote = stock.fifo.find((l) => l.id === c.req.param('id'));
  if (!lote) return c.json({ error: 'not found' }, 404);

  const tx = transactionsOf(lote).find((t) => t.id === c.req.param('txId'));
  if (!tx?.receipt_key) return c.json({ error: 'not found' }, 404);

  // comprovante é dado sensível: bucket privado, leitura por URL temporária
  const url = await getSignedUrl(
    s3Client,
    new GetObjectCommand({
      Bucket: process.env.ASSETS_S3_BUCKET_NAME,
      Key: tx.receipt_key,
    }),
    { expiresIn: 300 },
  );
  return c.json({ url });
});
