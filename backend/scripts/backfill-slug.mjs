// Backfill do slug: grava slug = kebab-case do título em todo livro que ainda
// não tem o campo. Idempotente (condição attribute_not_exists) e determinístico
// (ordem por created_at+id), então dry-run e execução real dão o mesmo mapa.
//
// Uso:  node backfill-slug.mjs [stage] [--dry-run]     (stage default: dev)
// Requer credenciais AWS locais com acesso ao ambiente (sa-east-1).
//
// A saída é feita pra guiar a renomeação das capas:
//   stdout -> "<id>\t<slug>" de TODOS os livros (um por linha)
//   stderr -> contagens e avisos
// Renomear os arquivos de frontend/public/images/<stage>/<id>.jpg para
// <slug>.jpg é passo manual (o dono faz quando quiser; até lá a capa cai no
// placeholder listrado).
import { DynamoDBClient, ScanCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';

const REGION = 'sa-east-1';
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const stage = args.find((a) => !a.startsWith('--')) ?? 'dev';
const TABLE = `livraria-tb-livros-${stage}`;
const ddb = new DynamoDBClient({ region: REGION });

// CÓPIA de backend/src/lib/slug.ts (script .mjs não importa TS). A paridade
// entre as duas é travada por teste em src/lib/slug.test.ts — mudou lá, muda aqui.
const MAX_SLUG_LENGTH = 60;
export function slugify(text) {
  const base = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!base) return 'livro';
  if (base.length <= MAX_SLUG_LENGTH) return base;
  const cut = base.slice(0, MAX_SLUG_LENGTH + 1);
  const lastDash = cut.lastIndexOf('-');
  const truncated = lastDash > 0 ? cut.slice(0, lastDash) : base.slice(0, MAX_SLUG_LENGTH);
  return truncated.replace(/-+$/, '');
}

// rodado direto (não importado pelo teste de paridade)
if (process.argv[1]?.endsWith('backfill-slug.mjs')) {
  // 1. lê o acervo inteiro antes de gravar: a unicidade depende do conjunto
  const items = [];
  let lastKey;
  do {
    const page = await ddb.send(
      new ScanCommand({
        TableName: TABLE,
        ProjectionExpression: 'id, title, slug, created_at',
        ExclusiveStartKey: lastKey,
      }),
    );
    for (const item of page.Items ?? []) {
      items.push({
        id: item.id?.S ?? '',
        title: item.title?.S ?? '',
        slug: item.slug?.S,
        created_at: item.created_at?.S ?? '',
      });
    }
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);

  // 2. ordem estável: garante que os sufixos -2/-3 caiam sempre nos mesmos livros
  items.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));

  // 3. slugs já gravados são intocáveis e entram no conjunto de tomados
  const taken = new Set(items.filter((i) => i.slug).map((i) => i.slug));
  let updated = 0;
  let skipped = 0;

  for (const item of items) {
    if (item.slug) {
      skipped++;
      process.stdout.write(`${item.id}\t${item.slug}\n`);
      continue;
    }
    const base = slugify(item.title);
    let slug = base;
    let n = 2;
    while (taken.has(slug)) slug = `${base}-${n++}`;
    taken.add(slug);

    if (!dryRun) {
      await ddb.send(
        new UpdateItemCommand({
          TableName: TABLE,
          Key: { id: { S: item.id } },
          ConditionExpression: 'attribute_not_exists(slug)',
          UpdateExpression: 'SET slug = :s',
          ExpressionAttributeValues: { ':s': { S: slug } },
        }),
      );
    }
    updated++;
    process.stdout.write(`${item.id}\t${slug}\n`);
  }

  const verbo = dryRun ? 'a gravar' : 'atualizados';
  process.stderr.write(
    `${TABLE}: ${items.length} livros, ${updated} ${verbo}, ${skipped} já tinham slug.` +
      (dryRun ? ' DRY-RUN: nada gravado.\n' : '\n'),
  );
}
