# Loja pública — catálogo, carrinho e consulta de pedido

> Regras: [`CLAUDE.md`](../CLAUDE.md) (limites do POST público, consulta sem PII, solicitação de cancelamento, estoque exibido). Aqui: o mapa, o porquê e as armadilhas.

Três telas, uma jornada: navegar → pedir → acompanhar. No backend, **um arquivo serve duas dessas etapas** (`backend/src/routes/pedidos.ts` faz criação **e** consulta pública), por isso elas moram juntas neste doc.

## Catálogo (`frontend/src/pages/Catalogo.tsx`)

- `GET /livros` devolve `amount = sellable` ([livros.ts:28](../backend/src/routes/livros.ts)) — o número **líquido**, que já desconta pedido não pago. Ver [estoque-e-lotes.md](estoque-e-lotes.md).
- Livro `archived` não vem na resposta (ausência de `state` = active); o catálogo não filtra nada — o corte é no backend, e `?state=all` existe para o backoffice e a consulta de pedido. Ver [livros.md](livros.md).
- `amount === 0` → ESGOTADO, e esgotados vão pro fim da lista com sort **estável** (preserva o `created_at desc` que o backend já mandou).
- Busca por título é client-side com `normalizeText` (acento-insensível), aplicada **antes** do sort de esgotados.
- `components/StockBadge.tsx` fala **"na região"** genérico, não o nome da região: `ACTIVE_REGION` ("SP, Capital — Zona Sul") não cabe numa badge e a região ativa já aparece no topo do catálogo. Singular tem texto próprio ("Último disponível na região").
- Não existe mais tag de status ("disponível"): foi removida ponta a ponta — o campo `status` saiu do `Book` e do `GET /livros`, porque ESGOTADO já comunica o único estado que importa.

## Carrinho (`frontend/src/pages/Carrinho.tsx`)

Um componente, três telas (`Step = 'cart' | 'checkout' | 'done'`). O estado do carrinho vive em `cart/CartContext.tsx` (reducer + `localStorage` sob `livraria:carrinho`), e o item guarda `slug` para a miniatura — carrinho salvo antes dessa mudança fica sem capa (aceito, ver [livros.md](livros.md)).

Na tela `done`: o código do pedido, o alerta de guardar, o botão **verde de WhatsApp** (`.order-done__whatsapp`) e o link de acompanhar. O botão abre `wa.me/5511933938090` com o **código já no texto** — o cliente não precisa decorar o que o alerta acima diz ser sua única credencial. É `target="_blank"` + `rel="noopener noreferrer"`, e o ícone é **SVG inline** porque a CSP do build (`img-src 'self' data:`) barra asset de CDN.

## Criação do pedido (`backend/src/routes/pedidos.ts`, `POST /`)

Limites anti-abuso ([pedidos.ts:12-14](../backend/src/routes/pedidos.ts)): `name` ≤80, `contact` ≤120, `region` ≤60, **40 unidades por pedido**, **20 por título**. Control chars removidos por `stripControlChars` (`backend/src/lib/sanitize.ts`).

O código do pedido tem 6 chars e é gerado com retry de colisão (`MAX_CODE_ATTEMPTS` = 5, [pedidos.ts:9](../backend/src/routes/pedidos.ts)). Uma linha DynamoDB **por unidade** (range key `title_id#unit_id`), gravadas em BatchWrite de 25.

**A criação não valida nem aloca estoque** — de propósito (regra do projeto): pedido além do estoque fica em `waiting-payment` e aparece na fila. É o que torna o `committed`/`sellable` necessário.

## Consulta pública (`GET /pedidos/:id`)

Devolve `{id, created_at, items:[…]}` e **nunca** `name`/`contact`/valores: o código tem 6 chars e é força-brutável. O código é normalizado (hífen/caixa) e formato inválido responde 404 **sem consultar o banco** (`normalizeCode`, [pedidos.ts:126](../backend/src/routes/pedidos.ts)) — evita gastar Query com lixo.

`POST /pedidos/:id/cancelamento` **não cancela**: grava `cancel_requested` na linha (sem tocar `updated_at`) e o backoffice decide. Ver [`decisions/0005-cancelamento-por-item-irreversivel.md`](decisions/0005-cancelamento-por-item-irreversivel.md).

A tela `/pedido` aceita `?codigo=` para prefill (a done-screen linka assim) e importa o modelo de status do backoffice (`frontend/src/backoffice/order-status.ts`) — acoplamento consciente, é a mesma máquina de estados.

## O caminho do coletivo

O site vive em `<domínio>/manoel-lisboa`, mas o bundle e as capas ficam na **raiz** do bucket: o CloudFront tira o prefixo na borda. No front, `siteBasename()` (`frontend/src/lib/basename.ts`) deriva o basename do `window.location.pathname`, o que mantém a origem S3 legada e o `vite dev` funcionando na raiz. Detalhe: [`decisions/0003-dominio-e-caminho-do-coletivo.md`](decisions/0003-dominio-e-caminho-do-coletivo.md).

## Verificação deste escopo

```sh
npm --prefix frontend test -- --run Catalogo LivroEntry StockBadge Carrinho ConsultarPedido App
npm --prefix backend test -- --run livros pedidos
```

`pedidos.test.ts` cobre criação **e** consulta pública no mesmo arquivo (e contém bytes de controle de propósito — ver [testes.md](testes.md)).

No browser, em dev: aba com nome/ícone, badge no singular correto, busca sem acento, e a tela `done` com o botão de WhatsApp abrindo o link com o código. Para chegar na `done` sem preencher formulário à mão, semeie `localStorage.livraria:carrinho` e navegue para `/manoel-lisboa/carrinho`.
