import {
  PutCommand,
  QueryCommand,
  ScanCommand,
  ScanCommandOutput,
} from "@aws-sdk/lib-dynamodb";
import { Hono } from "hono";
import { docClient } from "../lib/db";
import { stripControlChars } from "../lib/sanitize";

// limites anti-abuso da rota pública (pedido-bomba / payload gigante)
const FIELD_REQUIREMENTS = { name: 3, book_name: 3, status: 1 } as const;
const FIELD_LIMITS = { name: 80, book_name: 120, status: 32 } as const;
const MAX_UNITS_PER_ORDER = 40;
const MAX_UNITS_PER_TITLE = 20;

interface OrderItemInput {
  book_id: string;
  amount: number;
}

function parseItems(items: unknown): OrderItemInput[] | null {
  if (!Array.isArray(items) || items.length === 0) return null;
  const byBook = new Map<string, number>();
  for (const item of items) {
    const bookName = (item as OrderItemInput)?.book_id;
    const amount = (item as OrderItemInput)?.amount;
    if (typeof bookName !== "string" || bookName === "") return null;
    if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 1)
      return null;
    byBook.set(bookName, (byBook.get(bookName) ?? 0) + amount);
  }
  return [...byBook.entries()].map(([book_id, amount]) => ({
    book_id,
    amount,
  }));
}

export const leitura = new Hono();

async function scanReadList(limit = 10_000) {
  const items: Record<string, any>[] = [];
  let lastKey: Record<string, any> | undefined;

  do {
    const result: ScanCommandOutput = await docClient.send(
      new ScanCommand({
        TableName: process.env.LEITURAS_TABLE_NAME,
        ExclusiveStartKey: lastKey,
        Limit: Math.min(1000, limit - items.length),
      }),
    );

    items.push(...(result.Items ?? []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey && items.length < limit);

  return items;
}

async function queryReadList(name: string) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: process.env.LEITURAS_TABLE_NAME,
      KeyConditionExpression: "#name = :name",
      ExpressionAttributeNames: { "#name": "name" },
      ExpressionAttributeValues: { ":name": name },
    }),
  );
  return result.Items ?? [];
}

leitura.get("/list", async (c) => {
  const lines = await scanReadList();
  if (lines.length === 0) return c.json({ error: "not found" }, 404);

  const result: {
    name: string;
    books: { book_name: string; status: string }[];
  }[] = [];

  let groupedByName: Map<string, { book_name: string; status: string }[]> =
    new Map();
  lines.map((line) => {
    const g = groupedByName.get(line.name);
    const item = { book_name: line.book_name, status: line.status };
    if (g) {
      g.push(item);
    } else {
      groupedByName.set(line.name, [item]);
    }
  });

  for (const [name, books] of groupedByName) {
    result.push({ name, books });
  }

  return c.json({ status: "done", result });
});

leitura.get("/:name", async (c) => {
  const name = c.req.param("name");
  // código fora do formato nem consulta o banco (reduz brute-force barato)
  const NAME_REGEX = /([a-zA-Z0-9_\s]+)/g;
  if (!NAME_REGEX.test(name)) return c.json({ error: "not found" }, 404);

  const lines = await queryReadList(name);
  if (lines.length === 0) return c.json({ error: "not found" }, 404);

  const books = lines.map((line) => {
    const item: Record<string, unknown> = {
      book_name: line.book_name,
      status: line.status,
    };
    return item;
  });

  return c.json({ name, items: books });
});

leitura.post("/add", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "invalid json" }, 400);

  for (const field of ["name", "book_name", "status"] as const) {
    if (typeof body[field] !== "string" || body[field].trim() === "") {
      return c.json({ error: `${field} is required` }, 400);
    }
    if (body[field].length > FIELD_LIMITS[field]) {
      return c.json(
        { error: `${field} must be at most ${FIELD_LIMITS[field]} characters` },
        400,
      );
    }
    if (body[field].length < FIELD_REQUIREMENTS[field]) {
      return c.json(
        {
          error: `${field} must be at least ${FIELD_REQUIREMENTS[field]} characters`,
        },
        400,
      );
    }
  }

  const now = new Date().toISOString();

  await docClient.send(
    new PutCommand({
      TableName: process.env.LEITURAS_TABLE_NAME,
      Item: {
        name: stripControlChars(body.name),
        book_name: body.book_name,
        status: body.status,
        created_at: now,
        updated_at: now,
      },
    }),
  );

  return c.json({ status: "done" }, 201);
});
