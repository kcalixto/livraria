# Estoque e Lotes

> Regras: [`CLAUDE.md`](../CLAUDE.md) (bullets de lotes, estados que deduzem, dois números de estoque). Aqui: onde está o motor, por que ele é assim e o que quebra se você mexer.

## O motor: `backend/src/lib/stock.ts`

Um único `computeStock(region)` ([stock.ts:62](../backend/src/lib/stock.ts)) serve **três** consumidores — e é por isso que ele é o arquivo mais sensível do backend:

| Consumidor | O que usa | Onde |
|---|---|---|
| Vitrine pública | `sellable` | `backend/src/routes/livros.ts:24` |
| Tela de Estoque do backoffice | o `TitleStock` inteiro (mostra `available`) | `backend/src/routes/backoffice-estoque.ts` |
| Confirmação de pagamento | `available` + a lista `fifo`, via `allocateLote` | `backend/src/routes/backoffice-pedidos.ts:53` |

### Os três números (e por que são três)

`classifyUnit` ([stock.ts:52](../backend/src/lib/stock.ts)) classifica cada unidade de pedido da região:

- `sold` — `payment-received`, `sent-to-delivery`, `received` (`SOLD_STATUSES`, [stock.ts:46](../backend/src/lib/stock.ts))
- `picked_up` — qualquer unidade com `picked_up: true` que ainda não é venda
- `reserved` — `in-reserve`
- `committed` — `waiting-payment` sem retirada ([stock.ts:58](../backend/src/lib/stock.ts))
- `none` — `cancelled` (devolve tudo ao lote)

E o fechamento ([stock.ts:124-127](../backend/src/lib/stock.ts)):

```
available = acquired − reserved − picked_up − sold      ← saldo operacional
sellable  = max(0, available − committed)               ← o que a vitrine publica
```

**Por que `available` não desconta `committed`:** a alocação FIFO roda na transição para um estado que deduz. Se `available` já descontasse a unidade em `waiting-payment`, confirmar o pagamento dessa unidade falharia por "sem estoque" — ela estaria se descontando a si mesma. O `committed` existe justamente para a vitrine ser honesta sem quebrar a operação. Detalhe da decisão: [`decisions/0002-dois-numeros-de-estoque.md`](decisions/0002-dois-numeros-de-estoque.md).

**Piso em 0 no `sellable`** ([stock.ts:127](../backend/src/lib/stock.ts)): pedido além do estoque é permitido de propósito (a criação nunca valida estoque), então o excedente não pode virar número negativo.

**Unidade `committed` não toca o lote** ([stock.ts:111](../backend/src/lib/stock.ts)): ela não tem `lote_id` ainda, e o `continue` garante que o `remaining` do lote não a conte.

## Lotes: `backend/src/routes/backoffice-lotes.ts`

| Rota | Papel | Linha |
|---|---|---|
| `POST /` | cria o lote (custo já calculado pelo front) | [62](../backend/src/routes/backoffice-lotes.ts) |
| `PATCH /:id` | **única** rota de edição de lote — só a observação | [114](../backend/src/routes/backoffice-lotes.ts) |
| `GET /` e `GET /:id` | espalham o item cru + agregados de `computeStock` | [166](../backend/src/routes/backoffice-lotes.ts), [185](../backend/src/routes/backoffice-lotes.ts) |
| `POST /:id/transacoes` | transação com comprovante (magic bytes, ≤5 MB) | [205](../backend/src/routes/backoffice-lotes.ts) |

Notas que economizam tempo:

- **Não existe PUT de lote.** Data, região, livros e custo são histórico de compra: erro ali se corrige na base, não pela API. A observação foi a exceção porque é anotação, não dado contábil.
- **Os GETs espalham o item cru** (`{ ...lote }`), então atributo novo no item aparece na resposta **sem** mexer na leitura. Foi assim que `observation` chegou ao front de graça.
- **`parseBooks` descarta linha com `amount: 0`** ([backoffice-lotes.ts:28](../backend/src/routes/backoffice-lotes.ts)) e só devolve `null` se não sobrar nenhuma. Isso existe para o rascunho de digitação do form (abaixo) não derrubar o cadastro inteiro; `amount` negativo ou não inteiro continua 400.
- **Observação**: ≤200 chars validados **antes** do trim ([backoffice-lotes.ts:51-53](../backend/src/routes/backoffice-lotes.ts)) — o limite é sobre o payload cru; passa por `stripControlChars`; vazia **REMOVE** o atributo em vez de gravar string vazia.

## Form de lote: o rascunho de quantidade

`frontend/src/pages/backoffice/LoteForm.tsx` — o bug que motivou o desenho atual: `parseInt('') || 0` combinado com "0 remove a linha" fazia o livro **desaparecer no meio da digitação** (apagar o "1" para digitar "10").

Desenho atual:

- `selected` aceita 0; **nada** é removido por valor ([LoteForm.tsx:111](../frontend/src/pages/backoffice/LoteForm.tsx)).
- `qtyDraft` guarda só o input em foco ([LoteForm.tsx:35](../frontend/src/pages/backoffice/LoteForm.tsx)); `commitDraft` no blur converte `'' → 0` ([LoteForm.tsx:126](../frontend/src/pages/backoffice/LoteForm.tsx)).
- O botão "−" em 1 **remove a linha** (`removeBook`, [LoteForm.tsx:115](../frontend/src/pages/backoffice/LoteForm.tsx)) — é o caminho explícito de remoção, e tem teste antigo protegendo.
- `hasZeroed` ([LoteForm.tsx:137](../frontend/src/pages/backoffice/LoteForm.tsx)) trava o Salvar enquanto houver zerado, com `.field-error` explicando.
- O total é valor calculado, não campo: `.lote-form__total` + a dica `Σ preço × quantidade` ([LoteForm.tsx:202-203](../frontend/src/pages/backoffice/LoteForm.tsx)). O CSS foi deliberadamente despido de borda/fundo porque parecia input editável ao lado do input de data real.

## Verificação deste escopo

```sh
npm --prefix backend test -- --run stock backoffice-lotes backoffice-estoque
```

Cenário de ponta a ponta que **precisa** ser testado à mão quando mexer em estoque (a regressão mais perigosa do repo):

1. Crie um pedido e **não** pague.
2. `GET /livros` → o `amount` do título caiu 1.
3. `GET /backoffice/estoque` → o `available` do mesmo título **não** mudou.
4. Confirme o pagamento dessa unidade → 200 **e** a unidade sai com `lote_id` preenchido.

A skill `verificar-dev` roda exatamente isso.
