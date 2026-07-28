# 0004 — Correção de histórico não toca `created_at`/`updated_at`

**Data:** 2026-07-28 · **Escopo:** [pedidos](../pedidos.md)

## Contexto

A carga inicial veio de uma planilha: 30 pedidos históricos, com datas reais de meses anteriores, importados de uma vez. As telas exibiam `created_at`/`updated_at`, então todos apareciam com a data da importação. O dono precisava corrigir "Pedido em" e "Finalizado em" — e, depois, valor pago e status de itens antigos.

## Decisão

1. Nascem **colunas próprias**: `ordered_at` (pedido) e `finalized_at` (unidade). `created_at`/`updated_at` passam a ser exclusivamente do sistema (a regra está no [`CLAUDE.md`](../../CLAUDE.md)) e **nunca** são escritos por correção.
2. O front **prefere** as editáveis na exibição: `orderedAt(order)` e `finalizedAtOf(item)` com fallback para as colunas de sistema.
3. O builder de update foi partido em dois: `applyUpdate` (operacional, grava `updated_at`) e `applyEdit` (correção, **não** grava).
4. Rotas administrativas (todas admin): `PUT /:id` (nome + `ordered_at`, em todas as linhas do pedido) e `PUT /:id/unidades/:unitId` (valor, `finalized_at`, status, preço social, observação).
5. No `PUT` de unidade o **status é set direto**, sem matriz de transição — mas preservando os efeitos de estoque: entrar em estado que deduz sem `lote_id` aloca lote (400 se não houver); voltar para `waiting`/`cancelled` remove o `lote_id`.
6. Datas `YYYY-MM-DD` são normalizadas para `T12:00:00.000Z` (meio-dia UTC), anti-fuso.
7. **`DELETE` ≠ cancelamento**: `DELETE /:id` e `DELETE /:id/unidades/:unitId` apagam da base sem devolver estoque nem registrar venda — só para dado errado. No front, sempre atrás do `DangerConfirmModal`.

## Consequências

- Duas fontes de data por entidade. Quem for exibir data **tem** que usar os helpers; ler `created_at` direto volta a mostrar a data da importação.
- O set direto de status é poderoso e perigoso: ele contorna a matriz de transição de propósito (é ferramenta de correção), então quem mexe ali precisa manter os efeitos de estoque manualmente.
- Meio-dia UTC evita o clássico "a data volta um dia" em fuso negativo, ao custo de a hora exibida ser fictícia (9h em BRT).
- O delete definitivo não devolve estoque **de propósito**: se o dado estava errado, o estoque calculado a partir dele também estava.
- `paid_at` continua próprio e não entra nessa correção (é registro de quando o pagamento foi confirmado no sistema).

## Alternativas descartadas

- **Sobrescrever `created_at`/`updated_at` na correção**: mataria a única trilha confiável de quando o registro entrou/mudou no sistema. Era a solução de uma linha, e é exatamente o que o ADR existe para impedir.
- **Reusar o `PATCH` operacional para corrigir**: gravaria `updated_at` e aplicaria a matriz de transição — impossível corrigir um item que já está num estado final.
- **Editar direto no DynamoDB** (foi o que se fez na primeira correção de datas): funciona uma vez, não escala e não deixa nada auditável nem repetível pelo dono.
