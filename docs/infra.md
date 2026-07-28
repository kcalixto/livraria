# Infra e deploy

> Regras e endereços: [`CLAUDE.md`](../CLAUDE.md) e [`README.md`](../README.md). Aqui: como as peças se encaixam, por que estão assim e o que morde.

## O stack (`backend/serverless.yml`, 336 linhas)

Um stack por stage (`livraria-dev`, `livraria-prd`) com:

- **Lambda única** com o Hono (`httpApi: '*'`), envs resolvidas de SSM em **deploy-time**.
- **3 tabelas DynamoDB** PAY_PER_REQUEST com `DeletionPolicy: Retain` (GSI `status-index` em pedidos). São o contrato de dados das outras áreas — mexer aqui é mexer em todas.
- **`SiteSecurityHeaders`** (ResponseHeadersPolicy): HSTS, nosniff, frame DENY, referrer-policy. A CSP **não** vem daqui — é `<meta>` injetada no build.
- **`SiteRouter`** (CloudFront Function, viewer-request): resolve o caminho do coletivo na borda.
- **`SiteCdn`** + **`SiteDns`** (A+AAAA alias): a distribuição e o apontamento do domínio.
- **AWS Backup** condicionado a `IsPrd`: vault + plano `cron(0 7 * * ? *)` (~4h BRT), retenção 7 dias, seleção = as 3 tabelas. **Dev não cria nada.**
- **Outputs** `SiteCdnDomain`, `SiteCdnId`, `SiteUrl` — o `SiteCdnId` é o que o CI usa para invalidar.

### O certificado mora fora do stack (e por quê)

CloudFront só aceita ACM de **`us-east-1`**; o stack do serverless é `sa-east-1`, e uma stack não cria recurso em outra região. Então o wildcard `*.zonasul.click` vive em [`backend/infra/site-cert.yml`](../backend/infra/site-cert.yml), aplicado **uma vez**:

```sh
aws cloudformation deploy --region us-east-1 \
  --stack-name livraria-site-cert --template-file backend/infra/site-cert.yml
```

O ARN entra por SSM `/livraria/site-cert-arn` (em `sa-east-1`) e o `serverless.yml` o lê no deploy. O template valida por DNS sozinho (a zona está no `DomainValidationOptions`), então o stack só completa quando o cert é **emitido**.

### O caminho do coletivo na borda

`SiteRouter` faz três coisas: raiz → **302** pro caminho, `/manoel-lisboa` → `index.html`, `/manoel-lisboa/*` → tira o prefixo. Assim o bundle e as capas seguem na **raiz** do bucket (Vite `base` continua `/`, CI inalterado).

Runtime é `cloudfront-js-2.0`: **ES5.1+**, sem template literal e sem `startsWith` — use concatenação e `indexOf(...) === 0`. Detalhes e o porquê do 302: [`decisions/0003-dominio-e-caminho-do-coletivo.md`](decisions/0003-dominio-e-caminho-do-coletivo.md).

### Cache

`assets/*` em CachingOptimized (nomes com hash); todo o resto em CachingDisabled — deploy e capa nova aparecem na hora. O `SiteRouter` está associado só ao behavior default, então `/assets/*` nunca passa por ele.

Fallback SPA: 404 → `/index.html` com 200. Efeito colateral a conhecer: **qualquer** caminho inexistente responde 200 com HTML (inclusive asset com nome errado), o que atrapalha diagnóstico.

## CI/CD (`.github/workflows/deploy.yml`)

Job `test` (todo push/PR): `npm ci && npm run check && npm test` nos dois pacotes. **Não roda lint** (o oxlint do front existe no `package.json` mas não é chamado).

Job `deploy` (só push): `development` → dev, `main` → **prd**. Passos: `serverless deploy` → build do front → `s3 sync --delete --exclude "*.DS_Store"` → **invalidação** do CloudFront lendo `SiteCdnId` do stack, com `wait`.

Permissões que o deploy exige (além das óbvias): `route53:ChangeResourceRecordSets`, `cloudfront:CreateFunction`/`UpdateDistribution` e `cloudfront:CreateInvalidation`. **Se o próximo deploy prd falhar, é o suspeito nº 1** — as credenciais do CI podem não ser o mesmo usuário que aplicou isso à mão.

## Ambiente local (o que quebra sempre)

- O shell default tem **Node 16** e o hook do GVM quebra `cd`. Sempre: `export PATH="$HOME/.nvm/versions/node/v20.19.2/bin:$PATH"` e `builtin cd` / `npm --prefix`.
- **`builtin npx` não existe** — `npx` é binário, não builtin do shell. Em contexto onde `cd` é problemático, escreva um script `zsh` e execute com `zsh caminho/script.sh`.
- `.claude/dev-frontend.sh` + `.claude/launch.json` já embutem o PATH correto para o preview (com caminho absoluto hardcoded — vai quebrar se o repo mudar de lugar).

## Pendências de infra registradas

- **`LIVRARIA_FRONT_END_API_KEY` está hardcoded no `serverless.yml`**: o SSM `/livraria/front-end-api-key` foi apagado. Não é segredo (embarca no bundle), mas recriar o SSM ou manter é decisão do dono.
- **WAF não cabe neste stack** (escopo CLOUDFRONT exige `us-east-1`) e a API segue exposta direto no execute-api: [`decisions/0006-waf-fora-deste-stack.md`](decisions/0006-waf-fora-deste-stack.md).
- Backfills pendentes em prd: `backfill-social-price.mjs prd` e `backfill-slug.mjs prd` (e depois a renomeação manual das capas).

## Verificação

```sh
npx serverless package --stage dev   # valida o YAML sem tocar a AWS
```

Inspecionar o template gerado (`.serverless/cloudformation-template-update-stack.json`) é a forma rápida de conferir condicional (`IsPrd`), aliases e associação de função antes de deployar. Depois do deploy, a bateria de curl da skill `verificar-dev`.
