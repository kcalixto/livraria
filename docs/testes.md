# Testes — convenções e armadilhas

> Regra: TDD estrito (teste RED antes de qualquer código de produção), `npm test` + `npm run check` verdes antes de commit — ver [`CLAUDE.md`](../CLAUDE.md). Aqui: como os testes deste repo funcionam e o que já fez teste passar/falhar por motivo errado.

Estado atual: **39 arquivos, 334 casos** (frontend 194, backend 140). Vitest nos dois pacotes.

## Backend — `aws-sdk-client-mock`

Padrão: `mockClient(DynamoDBDocumentClient)`, `ddbMock.reset()` no `beforeEach`, envs de tabela setadas ali, e asserção sobre o **input do comando** (não sobre a resposta):

```ts
const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
expect(input.ExpressionAttributeValues?.[':slug']).toBe('a-ideologia-alema');
```

### Armadilha nº 1: comando não mockado resolve `undefined`

Não `{}` — `undefined`. Então `result.Items` estoura com `Cannot read properties of undefined (reading 'Items')`, e o sintoma aparece em **testes antigos** quando a rota ganha um comando novo.

Foi o que aconteceu ao introduzir o Scan do `uniqueSlug`: quatro testes de POST/PUT que nunca tinham visto Scan passaram a dar 500. O conserto certo é mockar o comando no `beforeEach` do arquivo (acervo vazio por padrão), deixando cada teste sobrescrever quando quiser testar colisão — ver `backend/src/routes/backoffice-livros.test.ts`. O conserto **errado** seria pôr `?.` na rota para satisfazer o mock.

### Armadilha nº 2: um arquivo de teste é "binário" de propósito

`backend/src/routes/pedidos.test.ts` contém bytes de controle **literais** na linha 337 (`0x07`, `0x00`, `0x1b`) — é o fixture que prova que `stripControlChars` os remove. Consequências:

- `file` classifica o arquivo como `data`;
- **`grep` sem `-a` ignora o arquivo em silêncio** (uma varredura de `it(` já quase deixou 11 casos fora da contagem);
- editar esse arquivo por heredoc de shell não funciona — use a ferramenta de edição.

Não "conserte" trocando os bytes por outra coisa sem entender: o teste perde o sentido. Se a greppabilidade incomodar, o caminho é escapar (`''`), que mantém a string igual em runtime.

### Matriz de perfis

`backend/src/routes/backoffice-roles.test.ts` testa perfil × rota e **não tem arquivo-fonte correspondente**. Rota nova de backoffice deve entrar lá — é o que impede o esquecimento de `requireRole` (ver [auth.md](auth.md)).

## Frontend — RTL + jsdom

`frontend/src/test-setup.ts` mocka `matchMedia` (default = **desktop**) porque jsdom não implementa; `vite.config.ts` fixa `TZ: America/Sao_Paulo` no ambiente de teste.

### Armadilha nº 3: mock de mobile vaza quando o teste falha

O padrão antigo era `vi.spyOn(window, 'matchMedia').mockImplementation(...)` no começo e `vi.restoreAllMocks()` **no fim do corpo** do teste. Se o teste falha antes de chegar lá, o mock **vaza para os testes seguintes** — e o sintoma é confuso: testes de desktop passam a não achar elementos, como se o componente estivesse errado.

Aconteceu de verdade nesta base: o card de pedido passou a nascer fechado no mobile, dois testes mobile quebraram, e o vazamento derrubou mais quatro. Correção: `vi.restoreAllMocks()` no **`afterEach`** + um helper `mockMobile()` no arquivo (`frontend/src/pages/backoffice/Pedidos.test.tsx`).

### Armadilha nº 4: TZ é o que quebra teste de data em CI

Asserção de hora (`'01/07 · 7h'`) passa localmente e falha em runner UTC. O `TZ` fixo no `vite.config.ts` resolve; verifique rodando com `TZ=UTC` se mexer em formatação de data.

### Padrões úteis já estabelecidos

- Rota-sentinela para provar navegação: registre `<Route path="…" element={<div>LISTA LOTES</div>} />` e asserte pelo texto.
- Payload de `fetch`: `fetchMock.mock.calls.find(([, i]) => i?.method === 'PUT')` + `JSON.parse(body)`.
- Estado inicial via `localStorage`/`sessionStorage` no `beforeEach` (carrinho, token) — mais rápido e estável que dirigir a UI.
- Fixture de `Book` **tipada** (`const books: Book[]`) pega campo removido no typecheck; fixture solta não pega.

## Quando teste não basta

Layout (jsdom não faz layout) e integração real com AWS. Para os dois há receita: [ui.md](ui.md) tem o harness estático de CSS; a skill `verificar-dev` tem a bateria de curl contra dev, incluindo a regressão de alocação de lote.

## Verificação

```sh
npm --prefix backend test -- --run && npm --prefix backend run check
npm --prefix frontend test -- --run && npm --prefix frontend run check
```
