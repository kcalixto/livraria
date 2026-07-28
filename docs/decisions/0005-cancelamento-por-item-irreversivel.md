# 0005 — Cancelamento é por item e não é reversível

**Data:** 2026-07-28 · **Escopo:** [pedidos](../pedidos.md), [loja](../loja.md)

## Contexto

O projeto tem uma regra fundadora: **toda ação administrativa é reversível**, porque erro humano acontece (liberar reserva volta pra espera, desfazer retirada idem — ambos devolvem a unidade ao lote). Faltava cancelar: pessoa desiste de um título de um pedido de vários, ou o livro não aparece.

## Decisão

1. Cancelamento é **por unidade**: `PATCH {cancel: true, unit_id}` marca `status: 'cancelled'` e **remove** `lote_id`, `picked_up` e `cancel_requested` — devolvendo o exemplar ao estoque. Sem `unit_id`, cancela todas as unidades não finalizadas do pedido.
2. `cancelled` é **terminal**: exceção deliberada à regra de reversibilidade.
3. A unidade cancelada aparece na aba Vendas (badge, valor `—`, **fora** do total) e na consulta pública como estado final — não desaparece.
4. O cliente **não cancela**: `POST /pedidos/:id/cancelamento` só grava `cancel_requested` (sem tocar `updated_at`); o backoffice vê o badge e decide.

## Consequências

- É a única operação administrativa sem volta, então no front ela vive atrás de confirmação (inline no desktop, `ConfirmActionModal` no mobile) e o texto sempre diz "não pode ser desfeito".
- Cancelar não apaga: o registro fica para relatório, o que preserva o histórico de "quantos desistiram". Quem quiser sumir com o dado usa o `DELETE` (ver [0004](0004-edicao-administrativa-e-timestamps.md)) — que é outra coisa.
- A solicitação pública **não** toca `updated_at` de propósito: pedido do cliente não é ação de operação e não deve mexer na trilha do sistema.
- 400 se a unidade já está finalizada, cancelada ou já tem solicitação — evita ruído na fila.

## Alternativas descartadas

- **Cancelamento reversível** (voltar de `cancelled` para `waiting`): coerente com o resto do sistema, mas cancelamento tem efeito no mundo real (o exemplar volta pra estante e pode ser vendido para outra pessoa). Um "descancelar" reivindicaria um exemplar que talvez não exista mais.
- **Cancelar só o pedido inteiro**: não cobre o caso comum (desistir de um título de vários), e forçaria recriar o pedido — perdendo o código que o cliente já guardou.
- **Deixar o cliente cancelar sozinho pela consulta pública**: o código de 6 chars é a única credencial e é força-brutável; cancelamento direto seria vandalizável.
