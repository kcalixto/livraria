# UI — convenções, mapa do `styles.css` e armadilhas de layout

> Regras: [`CLAUDE.md`](../CLAUDE.md) (convenções de UI do backoffice). Aqui: onde ficam as coisas no CSS e as armadilhas que já custaram bug.

`frontend/src/styles.css` tem **3.000+ linhas e ~60 seções comentadas**, atravessando todas as telas. Nenhum doc de escopo "possui" esse arquivo — as seções comentadas são o índice de fato, e este doc é o mapa.

## Mapa das seções (por onde entrar)

| Faixa | Cobre |
|---|---|
| ~1–115 | tokens (paleta papel/tinta/vinho, fontes), reset, `.btn` |
| ~116–280 | badges, header da loja, region picker |
| ~283–490 | catálogo, entrada de livro, skeleton |
| ~489–790 | carrinho, checkout, **pedido enviado** |
| ~790–890 | `.page--wide` (flex 100dvh, scroll só no `.bo-content`), abas |
| ~890–1110 | **`.order-card`** e o header sticky de tabela, stage pills |
| ~1110–1440 | vendas, estoque, Livros |
| ~1440–1810 | lotes (lista, form, detalhe, histórico) |
| ~1900–2100 | **bloco mobile (≤700px)** — grids de área, tooltips desligados |
| ~2330–2600 | cancelamento, ícones de ação, modais, observação |
| ~2700–3060 | edição administrativa, chips/accordion/fold, observação de lote, WhatsApp |

Convenção que sustenta isso: cada bloco novo entra **no fim** com um comentário `/* … */` explicando o **porquê**, não o quê.

## As cinco armadilhas de layout (todas já causaram bug real)

### 1. Header sticky pinta 16px **acima** de si

`.bo-livros__cols`, `.stock-table__cols`, `.sales-table__cols` e `.lote-detail__cols` são `position: sticky` com `box-shadow: 0 -16px 0 0 var(--surface)` ([styles.css:894-898](../frontend/src/styles.css)) — a faixa existe para cobrir o padding do container quando o header gruda no topo.

**Consequência:** qualquer elemento imediatamente antes da tabela precisa de **margem inferior > 16px**, senão é recortado (com `z-index: 5`, o header ganha). Foi exatamente o bug do botão "Adicionar observação" do lote: 26px de altura, 16 cobertos. O bloco de observação existente nunca sofreu porque já tinha `margin: 0 0 18px`. Fix em `.lote-detail__obs-add` ([styles.css:2979](../frontend/src/styles.css)).

### 2. `.order-card` tem `overflow: hidden`

[styles.css:961](../frontend/src/styles.css). Isso recorta qualquer coisa que vaze do card — inclusive o balão de tooltip dos `ActionIcon` do header, que abre pra cima por padrão. Daí o override que faz o tooltip do header abrir **pra baixo** com o caret invertido ([styles.css:2874](../frontend/src/styles.css)).

### 3. `.order-done` é bloco centralizado por texto

[styles.css:737](../frontend/src/styles.css) usa `text-align: center`, **não** flex. Elemento `inline-flex` ali divide a linha com o vizinho: foi o que colocou o botão de WhatsApp e o link "Acompanhar pedido" lado a lado, sobrepostos. Padrão correto para botão-bloco nessa tela: `display: flex; width: fit-content; margin: … auto`.

### 4. Grid de áreas no mobile não aceita filho novo em silêncio

No bloco ≤700px o `.order-card__header` vira `grid-template-areas` com todas as áreas nomeadas. Elemento novo **sem** `grid-area` declarada cai em auto-placement e desarruma a grade inteira — foi preciso declarar a área `fold` para o chevron ([styles.css:2998](../frontend/src/styles.css)).

### 5. Tooltip é CSS puro lendo `aria-label`

`.action-icon::after { content: attr(aria-label) }` ([styles.css:2384](../frontend/src/styles.css)), com 200ms de delay. Duas consequências: **não use `title`** (duplicaria o balão), e mudar o `aria-label` muda o texto visível. No touch (≤700px) os pseudo-elementos são desligados — no mobile a descrição da ação vem do `ConfirmActionModal`.

O mesmo padrão foi replicado em `.picked-alert` ([styles.css:2835](../frontend/src/styles.css)) para o ícone de "retirado sem pagamento".

## Componentes e suas regras

| Componente | Regra que importa |
|---|---|
| `ActionIcon` | `onClick: () => void` — **não recebe o evento** ([ActionIcon.tsx:63](../frontend/src/components/ActionIcon.tsx)). Quem precisa de `stopPropagation` faz no wrapper. |
| `ConfirmActionModal` | no mobile **substitui** a confirmação inline — nunca duplo confirm |
| `DangerConfirmModal` | só para operação irreversível: ícone de alerta + descrição em vermelho negrito |
| `Toast` | `pointer-events: none` — click-through de propósito (bloqueava a próxima ação) |
| `CoverThumb` | placeholder listrado quando não há slug **ou** a imagem falha |
| `ClampedText` | clamp com "ver mais"; usado em observação e descrição |
| `Loading` | spinner centralizado + "Carregando…" em sr-only |

## Verificação

Layout não tem teste automatizado (jsdom não faz layout). Duas receitas que funcionam:

1. **Browser em dev** (`preview_start` + screenshot + `resize_window` 375px). O backoffice exige senha — para a loja, dá para semear `localStorage` e navegar direto.
2. **Harness estático** quando a tela exige login: sirva um HTML que importa o `styles.css` real e reproduz o DOM da área, com a variante "antes" e "depois" lado a lado, e meça por `getBoundingClientRect()` no console. Foi assim que o bug do header sticky foi provado (16px cobertos → 0) sem precisar entrar no backoffice.
