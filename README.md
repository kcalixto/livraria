# Livraria Local

Webapp de livraria local: catálogo público focado nas descrições dos livros, carrinho com geração de pedido e backoffice (Pedidos/Vendas/Estoque).

## Stack

- **frontend/** — Vite + React (TS), deploy em S3 static website hosting
- **backend/** — Node 20 TS, Hono numa única Lambda (Serverless Framework v3), DynamoDB, `sa-east-1`
- Design: fonte da verdade no projeto Claude Design "Livraria local design system"

## Ambientes

| | dev | prd |
|---|---|---|
| API | `https://a07s4i4gvb.execute-api.sa-east-1.amazonaws.com` | `https://l674u4xyoj.execute-api.sa-east-1.amazonaws.com` |
| Site | `http://livraria-serverless-deployment-dev.s3-website-sa-east-1.amazonaws.com` | `http://livraria-serverless-deplyment-prd.s3-website-sa-east-1.amazonaws.com` |
| Tabelas | `livraria-tb-{livros,pedidos}-dev` | `livraria-tb-{livros,pedidos}-prd` |

Assets (imagens de capa): bucket único `livraria-assets-bucket`, separado por prefixo `dev/` e `prd/`. Deployment do serverless: `kcalixto-serverless-framework`.

## CI/CD

GitHub Actions (`.github/workflows/deploy.yml`): testes em todo push/PR; push na `development` → deploy dev; push na `main` → deploy prd. Credenciais AWS nos secrets do repo.

## Segredos (SSM, `sa-east-1`)

`/livraria/backoffice-api-key` (CRUD/upload de livros, header `x-api-key`), `/livraria/backoffice-key` (senha do backoffice), `/livraria/jwt-secret`. Resolvidos em **deploy-time** → rotação exige redeploy.

## Comandos

```sh
# em backend/ e frontend/ (Node 20)
npm test          # vitest
npm run check     # tsc --noEmit
# backend
npm run deploy:dev / deploy:prd
# frontend
npm run dev       # localhost:5173 (aponta pra API dev)
```

## Gestão de livros (sem tela por hora)

```sh
# criar livro
curl -X POST $API/backoffice/livros -H "x-api-key: $KEY" -H 'content-type: application/json' \
  -d '{"title":"...","description":"par1\n\npar2","price":4200,"author":"...","pages":288,"edition":"2ª","year":2024,"format":"Ensaio"}'
# subir capa (PNG, máx 2MB)
curl -X POST $API/backoffice/upload-image -H "x-api-key: $KEY" -H 'content-type: application/json' \
  -d "{\"book_id\":\"<id>\",\"image_base64\":\"$(base64 -i capa.png)\"}"
```

Preços em **centavos** (int). Estoque é **mockado** (amount aleatório 0–10 por chamada; ESGOTADO quando 0).
