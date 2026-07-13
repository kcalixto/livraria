// Backfill do preço social: grava social_price = price em todo livro que
// ainda não tem o campo. Idempotente (condição attribute_not_exists).
//
// Uso: node backfill-social-price.mjs [stage]   (default: dev)
// Requer credenciais AWS locais com acesso ao ambiente (sa-east-1).
import { DynamoDBClient, ScanCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';

const REGION = 'sa-east-1';
const stage = process.argv[2] ?? 'dev';
const TABLE = `livraria-tb-livros-${stage}`;
const ddb = new DynamoDBClient({ region: REGION });

let updated = 0;
let skipped = 0;
let lastKey;
do {
  const page = await ddb.send(
    new ScanCommand({
      TableName: TABLE,
      ProjectionExpression: 'id, price, social_price',
      ExclusiveStartKey: lastKey,
    }),
  );
  for (const item of page.Items ?? []) {
    if (item.social_price !== undefined) {
      skipped++;
      continue;
    }
    await ddb.send(
      new UpdateItemCommand({
        TableName: TABLE,
        Key: { id: item.id },
        ConditionExpression: 'attribute_not_exists(social_price)',
        UpdateExpression: 'SET social_price = :sp',
        ExpressionAttributeValues: { ':sp': item.price },
      }),
    );
    updated++;
  }
  lastKey = page.LastEvaluatedKey;
} while (lastKey);

console.log(`${TABLE}: ${updated} livros atualizados (social_price = price), ${skipped} já tinham.`);
