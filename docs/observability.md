# Investigar produção

Não há Datadog, APM nem alarme configurado. O que existe: log da Lambda no CloudWatch, métricas do DynamoDB e do CloudFront, e a própria API. Este doc é o caminho de sintoma → onde olhar.

## O que existe

| Peça | Onde olhar |
|---|---|
| Log da API | CloudWatch Logs, `/aws/lambda/livraria-{stage}-api` |
| Erros do stack / deploy | CloudFormation → eventos do stack `livraria-{stage}` |
| Métricas de tabela | CloudWatch → DynamoDB → `livraria-tb-{livros,pedidos,lotes}-{stage}` |
| Cache / requests do site | CloudWatch → CloudFront (distribuição do stage) |
| Backup (só prd) | AWS Backup → vault `livraria-backup-vault` |

Endereços e ids: [`README.md`](../README.md). O id da distribuição sai do Output `SiteCdnId` do stack.

## Sintoma → onde olhar

| Sintoma | Primeira hipótese | Como confirmar |
|---|---|---|
| Todas as capas no placeholder | banco sem `slug` (backfill não rodou) | `GET /livros` e olhar o campo `slug`. Correção: rodar `backfill-slug.mjs <stage>` — resolve em segundos, **sem** redeploy, porque o slug é lido em runtime |
| Uma capa no placeholder | arquivo com nome velho (título editado) | comparar o `slug` do livro com os arquivos de `frontend/public/images/<stage>/` |
| Livro ESGOTADO com exemplar na mão | pedido não pago segurando estoque (`committed`) | comparar `amount` do `GET /livros` com o `available` de `GET /backoffice/estoque`. Se diferem, é `committed`. Antídoto: cancelar o pedido abandonado |
| "Sem estoque disponível" ao confirmar pagamento | lote da região sem saldo, ou alguém mexeu em `available` | `GET /backoffice/estoque` e o `remaining` por lote em `GET /backoffice/lotes/:id` |
| Site fora do ar / 403 na raiz | S3 sync que apagou o `index.html`, ou distribuição sem alias | `curl -I https://<domínio>/manoel-lisboa` e `aws s3 ls s3://<bucket>` |
| Rota do SPA dando 404 | fallback SPA ou `SiteRouter` desconfigurado | `curl -I` numa rota interna: tem que vir **200 text/html** |
| Deploy prd falhou em Route53/CloudFront | credencial do CI sem permissão nova | mensagem do CloudFormation; ver as permissões listadas em [infra.md](infra.md) |
| CORS bloqueando o front | origem fora do allowlist (domínio novo?) | preflight: `curl -X OPTIONS $API/pedidos -H "origin: https://…" -i` |
| 401 inesperado no backoffice | token expirado (admin = 1h) ou rota fora do escopo do perfil | payload do JWT (`exp`) e a matriz em [auth.md](auth.md) |

## Comandos que resolvem a maioria dos casos

```sh
# log da Lambda, últimos 10 min
aws logs tail /aws/lambda/livraria-dev-api --since 10m --region sa-east-1

# eventos do stack (por que o deploy travou)
aws cloudformation describe-stack-events --stack-name livraria-dev --region sa-east-1 --max-items 15

# a distribuição e o endereço oficial
aws cloudformation describe-stacks --stack-name livraria-dev --region sa-east-1 \
  --query "Stacks[0].Outputs[?OutputKey=='SiteUrl'||OutputKey=='SiteCdnId'].[OutputKey,OutputValue]" --output text

# contagem por tabela (dev)
aws dynamodb scan --table-name livraria-tb-pedidos-dev --select COUNT --region sa-east-1
```

## Pendências conhecidas

- **Nenhum alarme.** Custo/consumo do DynamoDB e taxa de erro da Lambda passam em silêncio. Está no backlog do [`CLAUDE.md`](../CLAUDE.md).
- **Sem dashboard.** Investigação é por CLI/console.
- **Log sem correlação**: não há request id propagado nem log estruturado; o que aparece é o que o Hono/Lambda emite por padrão.
