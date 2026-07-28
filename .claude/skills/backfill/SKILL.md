---
name: backfill
description: Roda as migrações de dado da livraria (slug dos livros, preço social) com dry-run antes e conferência do mapa depois, incluindo o passo manual de renomear as capas. Use quando o usuário pedir para "rodar o backfill", "migrar os livros", "preencher o slug/preço social", ou antes de um deploy prd que dependa disso.
---

# Backfill de dado

Duas migrações, ambas idempotentes (`ConditionExpression: attribute_not_exists`) e com stage em `argv[2]` (default `dev`):

| Script | O que grava |
|---|---|
| `backend/scripts/backfill-slug.mjs` | `slug` = kebab-case do título, único por sufixo `-2` |
| `backend/scripts/backfill-social-price.mjs` | `social_price` = `price` nos livros legados |

Node 20 é obrigatório: `export PATH="$HOME/.nvm/versions/node/v20.19.2/bin:$PATH"`.

## Rito do slug (o que tem ordem)

```sh
# 1. dry-run: calcula e imprime, não grava
node backend/scripts/backfill-slug.mjs <stage> --dry-run

# 2. execução real
node backend/scripts/backfill-slug.mjs <stage>

# 3. idempotência: rodar de novo tem que dizer "0 atualizados"
node backend/scripts/backfill-slug.mjs <stage>
```

**Confira que o mapa `id → slug` da execução real é idêntico ao do dry-run.** Ele é determinístico (ordem por `created_at`+`id`) justamente para isso — se divergir, dois títulos iguais trocaram de sufixo e a renomeação das capas sairia cruzada.

O mapa sai em **stdout** (`<id>\t<slug>`) e as contagens em **stderr**, então dá para redirecionar só o mapa para um arquivo.

## Capas: passo manual, por decisão

Renomear `frontend/public/images/<stage>/<id>.jpg` → `<slug>.jpg` é **manual** — o dono faz quando quiser (ver `docs/decisions/0001-slug-e-capa-por-slug.md`). Até lá as capas ficam no placeholder listrado. **Não** escreva script de renomeação nem proponha fallback `slug ?? id`: as duas coisas foram descartadas de propósito.

## Ordem em produção (a parte que não pode inverter)

1. `node backend/scripts/backfill-slug.mjs prd` — **antes** do deploy. É seguro: o bundle no ar ignora o campo `slug`.
2. Merge/push na `main` (deploy prd) — decisão do dono.

O inverso derruba **todas** as capas: bundle novo pedindo `<slug>.jpg`, banco sem slug e arquivos velhos apagados pelo `s3 sync --delete`.

Se todas as capas caírem em prd, o diagnóstico é "banco sem slug" e a correção é rodar o backfill — resolve em segundos, **sem** redeploy, porque o slug é lido da API em runtime.

## Verificação

```sh
curl -s "$API/livros" -H "x-api-key: $KEY" | node -pe '
  const b = JSON.parse(require("fs").readFileSync(0));
  b.filter(x => !x.slug).length + " livros sem slug de " + b.length'
```

Espere `0 livros sem slug`.

## Restrições

- Rodar em **prd** requer autorização explícita do dono.
- Nunca edite os itens à mão para "consertar" um slug: mude o título pela API (o slug é regerado) ou renomeie a capa.
