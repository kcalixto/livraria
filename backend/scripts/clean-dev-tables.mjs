// Limpa o ambiente de DEV: apaga TODOS os itens de pedidos/vendas e de
// lotes/estoque, e os comprovantes de transação do S3 (prefixo dev/).
// A tabela de LIVROS é preservada — o catálogo continua intacto.
//
// Uso: node clean-dev-tables.mjs
// Requer credenciais AWS locais com acesso ao dev (sa-east-1).
import {
  BatchWriteItemCommand,
  DynamoDBClient,
  ScanCommand,
} from '@aws-sdk/client-dynamodb';
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';

const REGION = 'sa-east-1';
const ddb = new DynamoDBClient({ region: REGION });
const s3 = new S3Client({ region: REGION });

// tabela → atributos da chave (a de livros fica DE FORA por design)
const TABLES = [
  { name: 'livraria-tb-pedidos-dev', keys: ['id', 'book_id'] },
  { name: 'livraria-tb-lotes-dev', keys: ['id'] },
];
const ASSETS_BUCKET = 'livraria-assets-bucket';
const RECEIPTS_PREFIX = 'dev/comprovantes/';

async function wipeTable({ name, keys }) {
  let deleted = 0;
  let lastKey;
  do {
    const page = await ddb.send(
      new ScanCommand({
        TableName: name,
        ProjectionExpression: keys.map((_, i) => `#k${i}`).join(','),
        ExpressionAttributeNames: Object.fromEntries(keys.map((k, i) => [`#k${i}`, k])),
        ExclusiveStartKey: lastKey,
      }),
    );
    const items = page.Items ?? [];
    for (let i = 0; i < items.length; i += 25) {
      const chunk = items.slice(i, i + 25);
      await ddb.send(
        new BatchWriteItemCommand({
          RequestItems: {
            [name]: chunk.map((item) => ({ DeleteRequest: { Key: item } })),
          },
        }),
      );
      deleted += chunk.length;
    }
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);
  console.log(`${name}: ${deleted} itens removidos`);
}

async function wipeReceipts() {
  let deleted = 0;
  let token;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({
        Bucket: ASSETS_BUCKET,
        Prefix: RECEIPTS_PREFIX,
        ContinuationToken: token,
      }),
    );
    const objects = (page.Contents ?? []).map(({ Key }) => ({ Key }));
    if (objects.length > 0) {
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: ASSETS_BUCKET,
          Delete: { Objects: objects },
        }),
      );
      deleted += objects.length;
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  console.log(`s3://${ASSETS_BUCKET}/${RECEIPTS_PREFIX}: ${deleted} comprovantes removidos`);
}

for (const table of TABLES) await wipeTable(table);
await wipeReceipts();
console.log('ambiente dev limpo (tabela de livros preservada)');
