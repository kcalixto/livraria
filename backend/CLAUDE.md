# backend — como mexer aqui

Node 20 TS, Hono numa única Lambda (Serverless Framework v3), DynamoDB, `sa-east-1`. As **regras de negócio** estão no `CLAUDE.md` da raiz; este arquivo é só o que é específico deste pacote.

## Comandos

```sh
npm test          # vitest (aws-sdk-client-mock)
npm run check     # tsc --noEmit
npm run deploy:dev
```

Os scripts `.mjs` de `scripts/` precisam de Node 20 explícito — o shell default tem 16:

```sh
export PATH="$HOME/.nvm/versions/node/v20.19.2/bin:$PATH"
```

## Armadilhas deste pacote

- **`aws-sdk-client-mock` resolve `undefined`** (não `{}`) para comando sem `.on()`. Rota que ganhou um Scan novo derruba testes antigos com `Cannot read properties of undefined (reading 'Items')` — mocke o comando no `beforeEach`. Precedente: `src/routes/backoffice-livros.test.ts` (o `ScanCommand` do `uniqueSlug`).
- **Um arquivo, duas áreas**: `src/routes/pedidos.ts` serve criação de pedido (público) **e** consulta pública + solicitação de cancelamento. `src/routes/backoffice-pedidos.ts` cobre fila, transições, retirada, cancelamento, edição administrativa e delete — e escreve `lote_id` (estoque).
- **`src/lib/stock.ts` é motor compartilhado** por três rotas (vitrine, estoque do backoffice, alocação FIFO no pagamento). Mexer em `available` quebra a confirmação de pagamento — ver `docs/decisions/0002-dois-numeros-de-estoque.md`.
- **`src/routes/pedidos.test.ts` contém bytes de controle de propósito** (fixture do `stripControlChars`): `file` diz `data` e `grep` sem `-a` ignora o arquivo em silêncio.
- Rota nova é a **fronteira de autorização**: sem `requireRole` ela fica aberta a qualquer token válido. Ver `docs/auth.md`.

## Docs relevantes

`docs/auth.md` · `docs/estoque-e-lotes.md` · `docs/pedidos.md` · `docs/livros.md` · `docs/infra.md` · `docs/testes.md`
