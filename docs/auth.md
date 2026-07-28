# Auth e perfis de acesso

> Regras: [`CLAUDE.md`](../CLAUDE.md) (duas camadas, matriz de perfis). Aqui: onde está cada gate e o que acontece se você esquecer um.

## Duas camadas, propósitos diferentes

| Camada | O que protege | Onde |
|---|---|---|
| `x-api-key` global | fricção anti-bot em **todas** as rotas | `backend/src/middlewares/api-key.ts` |
| JWT por perfil | autorização real do backoffice | `backend/src/middlewares/jwt.ts` + `require-role.ts` |

O DELETE de livro já teve uma terceira camada (`x-admin-api-key`); ela foi substituída pela trava de venda — ver [0007](decisions/0007-delete-de-livro-trava-de-venda.md).

A api key **não é segredo**: ela embarca no bundle via `VITE_API_KEY`. Tratá-la como segredo é o erro conceitual a evitar — ela existe para elevar o custo de script automatizado, não para autenticar.

## A fronteira real é `requireRole`

`requireRole(...roles)` ([require-role.ts:13](../backend/src/middlewares/require-role.ts)) lê o role que o `jwtMiddleware` colocou no contexto (tipado via augmentation de `ContextVariableMap`, [require-role.ts:6](../backend/src/middlewares/require-role.ts)) e responde **401** fora do escopo.

**Rota nova sem `requireRole` fica aberta a qualquer token válido** — inclusive o de leitura. Essa é a falha silenciosa mais fácil de cometer neste repo: o teste de uma rota nova costuma usar token admin e passa. O antídoto existe: `backend/src/routes/backoffice-roles.test.ts` é uma matriz cross-rotas (não tem arquivo-fonte correspondente) que confere perfil × rota. **Adicione a rota nova lá.**

Matriz vigente: estoque GET = todos os perfis; pedidos/lotes GET = viewer+admin; qualquer escrita = admin.

## Perfis por senha, sem banco de usuários

`POST /backoffice/login` (`backend/src/routes/backoffice-auth.ts`) compara a senha com três parâmetros SSM e devolve `{token, role}`: admin (1h), viewer (24h), stock (24h). A senha usada **define** o perfil — não há usuário, o que casa com a operação (poucas pessoas, senha compartilhada por função).

Como os secrets são resolvidos em **deploy-time**, rotacionar qualquer chave exige redeploy. Os parâmetros são compartilhados entre dev e prd.

## Front: cosmético por definição

`frontend/src/backoffice/auth.ts` — token em `sessionStorage`, `tokenRole()`/`canWrite()` lendo o payload sem verificar assinatura. É **cosmético de propósito**: esconde abas e botões que a API negaria de qualquer forma. Token ilegível age como escrita (não esconde nada de token legado) — a API nega se for o caso.

`BackofficeLayout.tsx` faz os guards de rota (perfil `stock` só vê Estoque/Livros; rota de form exige `canWrite()`), e `useBackofficeResource`/`RedirectToLogin` centralizam o 401 → limpa token → volta pro login.

## CORS

`backend/src/app.ts` — allowlist explícita ([app.ts:16](../backend/src/app.ts)) com os domínios próprios + as origens S3 legadas + `localhost:*`, mais o domínio do CloudFront injetado por env (`SITE_CDN_DOMAIN`, [app.ts:30](../backend/src/app.ts), resolvido no deploy por `!GetAtt`). Lido **lazy** para o teste poder setar a env.

Subdomínio arbitrário do mesmo domínio **não** é liberado (não há wildcard) — há teste provando.

CORS só afeta browser: curl e scripts não passam por ele. Não é controle de acesso.

## Verificação deste escopo

```sh
npm --prefix backend test -- --run backoffice-auth backoffice-roles api-key app
npm --prefix frontend test -- --run Login BackofficeLayout client
```
