# Livraria Local

Webapp de livraria **social, sem fim de lucro**, de um coletivo local: catálogo público focado nas descrições dos livros, carrinho anônimo com geração de pedido (código de 6 chars), consulta pública de pedido em `/pedido`, e backoffice (Pedidos / Vendas / Estoque / Lotes / Livros) com três perfis de acesso.

## Stack

- **frontend/** — Vite + React (TS), deploy em S3 static website hosting atrás de CloudFront (HTTPS + headers de segurança)
- **backend/** — Node 20 TS, Hono numa única Lambda (Serverless Framework v3), DynamoDB, `sa-east-1`
- Design: fonte da verdade no projeto Claude Design "Livraria local design system"
- Regras de negócio e convenções completas: [CLAUDE.md](CLAUDE.md)

## Ambientes

| | dev | prd |
|---|---|---|
| API | `https://a07s4i4gvb.execute-api.sa-east-1.amazonaws.com` | `https://l674u4xyoj.execute-api.sa-east-1.amazonaws.com` |
| Site (CloudFront) | `https://d3ahs91xggvxw0.cloudfront.net` | nasce no próximo deploy prd (Output `SiteCdnDomain` do stack `livraria-prd`) |
| Site (S3 legado) | `http://livraria-serverless-deployment-dev.s3-website-sa-east-1.amazonaws.com` | `http://livraria-serverless-deplyment-prd.s3-website-sa-east-1.amazonaws.com` |
| Tabelas | `livraria-tb-{livros,pedidos,lotes}-dev` | `livraria-tb-{livros,pedidos,lotes}-prd` |

O endereço oficial do site é o do **CloudFront** (HTTPS, HSTS/nosniff/frame-deny, fallback SPA, cache de `assets/*` na edge). O endpoint S3 continua funcionando como origem/legado, mas não deve ser divulgado.

Capas de livro: arquivos em `frontend/public/images/<stage>/<id-do-livro>.jpg` — entram no build do site e são servidas pela mesma origem (capa nova exige novo build/deploy; comprimir com `frontend/scripts/compress-covers.sh`, teto 200KB). Comprovantes pix de transações de lote: privados em `livraria-assets-bucket/<stage>/comprovantes/`, lidos só por URL pré-assinada. Deployment bucket do serverless: `kcalixto-serverless-framework`.

## CI/CD

GitHub Actions (`.github/workflows/deploy.yml`): testes em todo push/PR; push na `development` → deploy dev; push na `main` → deploy prd. Credenciais AWS nos secrets do repo.

## Auth e perfis de acesso

- **`x-api-key` (gate global):** TODAS as rotas exigem o header. Valor em `/livraria/front-end-api-key` (SSM) → env `LIVRARIA_FRONT_END_API_KEY`, embarcado no bundle via `VITE_API_KEY` (⚠️ **não é segredo** — fricção anti-bot).
- **JWT por perfil** (`POST /backoffice/login` com a senha → `{token, role}`; secret `/livraria/jwt-secret`). A senha usada define o perfil — sem banco de usuários:

| Perfil | SSM | Token | Escopo |
|---|---|---|---|
| `admin` | `/livraria/backoffice-key` | 1h | leitura + escrita |
| `viewer` | `/livraria/backoffice-viewer-key` | 24h | leitura completa (CSVs inclusos) |
| `stock` | `/livraria/backoffice-stock-key` | 24h | leitura de estoque + livros |

  Fora do escopo do token a API responde **401** (`requireRole` por rota); o front esconde abas/ações, mas a fronteira é o backend.
- **Exclusão de livro** exige, além do JWT admin, o header `x-admin-api-key` (`/livraria/backoffice-admin-api-key`) — só via curl.
- SSM resolvido em **deploy-time** → rotação de qualquer segredo exige redeploy. ⚠️ Os params são compartilhados entre dev e prd.

## Comandos

```sh
# em backend/ e frontend/ (Node 20)
npm test          # vitest (TZ fixado em America/Sao_Paulo pela config)
npm run check     # tsc --noEmit
# backend
npm run deploy:dev / deploy:prd
node scripts/backfill-social-price.mjs <stage>   # social_price = price nos livros sem o campo
node scripts/clean-dev-tables.mjs                # zera pedidos/lotes do DEV (preserva livros)
# frontend
npm run dev       # localhost:5173 (aponta pra API dev)
```

## Gestão de livros

Pela tela **Livros** do backoffice (criar/editar; o id copiável na listagem é o nome do arquivo da capa), ou via API com JWT admin. `price` e `social_price` são obrigatórios, em **centavos**:

```sh
TOKEN=$(curl -s -X POST $API/backoffice/login -H "x-api-key: $KEY" -H 'content-type: application/json' -d '{"password":"..."}' | jq -r .token)
curl -X POST $API/backoffice/livros -H "authorization: Bearer $TOKEN" -H "x-api-key: $KEY" -H 'content-type: application/json' \
  -d '{"title":"...","description":"par1\n\npar2","price":4200,"social_price":3000,"author":"...","pages":288,"edition":"2ª","year":2024,"format":"Ensaio"}'

# excluir (segmentado — sem botão no front)
curl -X DELETE $API/backoffice/livros/<id> -H "authorization: Bearer $TOKEN" -H "x-api-key: $KEY" -H "x-admin-api-key: $ADMIN_KEY"
```

## Fluxo do pedido (resumo)

A venda é por **unidade** (`unit_id`); o pedido é só o agrupador. Fluxo normal `waiting-payment → payment-received → sent-to-delivery → received`; `in-reserve` e `picked_up` (retirada sem pagamento) são excepcionais e reversíveis; **`cancelled` é terminal** (por item ou pedido inteiro; devolve estoque ao lote). O estoque deriva de **Lotes** (alocação FIFO na transição que deduz). O pagamento registra o **valor recebido** por unidade (doações contam no lote) e pode marcar **preço social**. O cliente consulta o pedido em `/pedido` pelo código e pode **solicitar** cancelamento por item (o backoffice decide). Regras completas no [CLAUDE.md](CLAUDE.md).

## Segurança das rotas públicas

Limites no `POST /pedidos` (name ≤80, contact ≤120, ≤40 unidades/pedido e ≤20 por título, control chars removidos); código malformado responde 404 sem consultar o banco; CORS restrito aos sites + localhost; CSP via `<meta>` injetada no build; CSVs neutralizam fórmulas do Excel. Backlog (throttling/WAF/CloudFront etc.) no [CLAUDE.md](CLAUDE.md).
