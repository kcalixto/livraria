# Pedidos (backoffice) e Vendas

> Regras: [`CLAUDE.md`](../CLAUDE.md) (fluxo por unidade, estados que deduzem, reversibilidade, cancelamento, evento, edição administrativa, DELETE). Aqui: o mapa do núcleo do repo, o porquê e as armadilhas.

**É a área mais densa do projeto**: `Pedidos.tsx` (877 linhas) + `backoffice-pedidos.ts` (521) = 1.398 de fonte e 1.904 de teste. Leia este doc antes de mexer.

## Backend: `backend/src/routes/backoffice-pedidos.ts`

| Bloco | Papel | Linha |
|---|---|---|
| `ORDER_FIELDS` / `UNIT_FIELDS` | whitelist de atributos graváveis | [18](../backend/src/routes/backoffice-pedidos.ts), [20](../backend/src/routes/backoffice-pedidos.ts) |
| `TRANSITIONS` / `PICKED_UP_TRANSITIONS` | matriz do fluxo normal e do fluxo curto da unidade retirada | [40](../backend/src/routes/backoffice-pedidos.ts), [48](../backend/src/routes/backoffice-pedidos.ts) |
| `allocateLote` | FIFO: pega o lote mais antigo da região com saldo | [53](../backend/src/routes/backoffice-pedidos.ts) |
| `sendUpdate` / `applyUpdate` / `applyEdit` | builder de SET/REMOVE; **`applyUpdate` grava `updated_at`, `applyEdit` não** | [67](../backend/src/routes/backoffice-pedidos.ts), [95](../backend/src/routes/backoffice-pedidos.ts), [103](../backend/src/routes/backoffice-pedidos.ts) |
| `parseEditDate` | `YYYY-MM-DD` → `T12:00:00.000Z` (anti-fuso) | [108](../backend/src/routes/backoffice-pedidos.ts) |
| `PATCH /:id/status` | fluxo operacional: transição, retirada on/off, cancelamento, pagamento, observação | [160](../backend/src/routes/backoffice-pedidos.ts) |
| `PUT /:id` e `PUT /:id/unidades/:unitId` | correção de histórico (admin) | [359](../backend/src/routes/backoffice-pedidos.ts), [398](../backend/src/routes/backoffice-pedidos.ts) |
| `DELETE /:id` e `DELETE /:id/unidades/:unitId` | apagar da base (≠ cancelar) | [475](../backend/src/routes/backoffice-pedidos.ts), [502](../backend/src/routes/backoffice-pedidos.ts) |

**A divisão `applyUpdate` vs `applyEdit` é o coração da correção de histórico.** Ação operacional deve mexer em `updated_at`; correção de dado antigo **não** — senão o "Finalizado em" da tela viraria a data da correção. Daí as colunas próprias `ordered_at`/`finalized_at`, que o front prefere na exibição. Ver [`decisions/0004-edicao-administrativa-e-timestamps.md`](decisions/0004-edicao-administrativa-e-timestamps.md).

**`PUT` de unidade é set direto** (sem matriz de transição) mas **preserva os efeitos de estoque**: entrar em estado que deduz sem `lote_id` chama `allocateLote` (400 se não houver), e voltar para `waiting`/`cancelled` remove `lote_id`. Ignorar isso é como se corrompe o estoque.

**Observação de unidade**: ≤1000 chars (`MAX_OBSERVATION_CHARS`, [36](../backend/src/routes/backoffice-pedidos.ts)), validada **antes** do trim, vazia REMOVE o atributo. Dois caminhos a manter em sincronia: o `PATCH` operacional ([174](../backend/src/routes/backoffice-pedidos.ts)) e o `PUT` administrativo ([426](../backend/src/routes/backoffice-pedidos.ts)).

## Front: `frontend/src/pages/backoffice/Pedidos.tsx`

Estruturas que valem conhecer antes de editar:

- **`StatusCell`** ([43](../frontend/src/pages/backoffice/Pedidos.tsx)): pill + barra de estágios. Unidade retirada tem fluxo de **2** segmentos, não 4 (`segCount`, [52](../frontend/src/pages/backoffice/Pedidos.tsx)); e o "retirado sem pagamento" é um **ícone de alerta** com `aria-label` (`.picked-alert`, [58](../frontend/src/pages/backoffice/Pedidos.tsx)) — testes buscam por `getByLabelText`, não por texto.
- **Chips por predicado** (`CHIP_PREDICATES` [82](../frontend/src/pages/backoffice/Pedidos.tsx), `CHIP_OPTIONS` [90](../frontend/src/pages/backoffice/Pedidos.tsx)): o filtro **não** é por status cru — "Entrega pendente" é `(payment-received && !picked) || sent-to-delivery`. As somas são calculadas sobre a fila aberta inteira, antes de busca e filtro ([164-167](../frontend/src/pages/backoffice/Pedidos.tsx)). "Pagamento pendente" soma **todo** dinheiro a receber, incluindo retirados sem pagamento — decisão do dono.
- **Dois níveis de recolhimento, não confunda**: `expandedDone` ([130](../frontend/src/pages/backoffice/Pedidos.tsx)) esconde os **itens fechados** dentro de um card; `foldOverrides` ([133](../frontend/src/pages/backoffice/Pedidos.tsx)) recolhe o **card inteiro**. O card usa default por dispositivo — `foldOverrides.get(id) ?? !isMobile` ([480](../frontend/src/pages/backoffice/Pedidos.tsx)) — para nascer fechado no celular sem precisar conhecer os ids antes do fetch.
- **`renderOrderCard`** ([472](../frontend/src/pages/backoffice/Pedidos.tsx)) é uma função, não componente: fecha sobre todo o estado da página. Por isso o mesmo markup serve fila e (antes) accordion.

### Armadilha do clique no header

`ActionIcon.onClick` é `() => void` e **não recebe o evento** ([ActionIcon.tsx:63](../frontend/src/components/ActionIcon.tsx)). Como o header do card é clicável (recolher), a propagação é barrada nos **wrappers** — `.order-card__order-actions` e `.order-card__contact` (que tem link `wa.me`/`mailto`) — em vez de mudar a assinatura em ~25 call sites. Se adicionar interativo novo no header, ele precisa do mesmo `stopPropagation`.

O controle acessível é o chevron com `aria-expanded`/`aria-controls`; o clique no header é conveniência. O repo **nunca** põe `onClick` em `role="row"`.

## Vendas

`frontend/src/pages/backoffice/Vendas.tsx` — **não tem rota de backend**: deriva de `GET /backoffice/pedidos` via `useOrders` e filtra `isUnitClosed`. Datas exibidas preferem as editáveis (`orderedAt` [order-status.ts:36](../frontend/src/backoffice/order-status.ts), `finalizedAtOf` [40](../frontend/src/backoffice/order-status.ts)). Unidade cancelada aparece com valor `—` e **fora** do total. CSV usa `csvEscape` (`frontend/src/lib/csv.ts`), que neutraliza fórmula do Excel (`= + - @` viram texto).

## Modelo de status compartilhado

`frontend/src/backoffice/order-status.ts` mora em `backoffice/` mas é importado pela **consulta pública** (`pages/ConsultarPedido.tsx`), por Vendas e pelo modal de resumo. `isUnitFinalized` existe **duas vezes** (aqui e em `backend/src/lib/order-status.ts`) — mesma regra, duas implementações: mudar uma exige mudar a outra.

## Verificação deste escopo

```sh
npm --prefix backend test -- --run backoffice-pedidos
npm --prefix frontend test -- --run Pedidos Vendas PedidoEdit PedidoItemEdit
```

À mão em dev, o que teste não pega: confirmar pagamento de unidade retirada (deve finalizar e exibir como entregue), cancelar item de pedido misto (o resto continua vivo), e o card nascendo fechado em 375px.
