# 0002 — Dois números de estoque: `available` operacional × `sellable` da vitrine

**Data:** 2026-07-28 · **Escopo:** [estoque-e-lotes](../estoque-e-lotes.md)

## Contexto

A vitrine mostrava `available = adquirido − reservado − retirado − vendido`. Unidade em `waiting-payment` (pedido criado, ainda não pago) **não** era descontada, porque a criação de pedido nunca valida nem aloca estoque — regra deliberada do projeto. Resultado: um livro com 4 exemplares e 4 pedidos não pagos continuava anunciando 4, e a livraria poderia vender o que já estava prometido.

O dono pediu que a vitrine descontasse **toda** unidade presa em pedido aberto, incluindo as não pagas, valendo também para o ESGOTADO e para o botão de comprar.

## Decisão

`computeStock` passa a produzir **três** números por título, e `available` fica **intocado**:

```
committed = unidades em waiting-payment sem retirada
available = acquired − reserved − picked_up − sold        (operacional)
sellable  = max(0, available − committed)                 (vitrine)
```

`GET /livros` publica `amount: sellable`. A alocação FIFO no pagamento e a tela de Estoque do backoffice continuam em `available`.

## Consequências

- **A razão de `available` não mudar**: a alocação FIFO acontece na transição para um estado que deduz. Se `available` já descontasse a unidade em `waiting-payment`, confirmar o pagamento **dessa** unidade falharia por "sem estoque" — ela se descontaria a si mesma. Essa é a regressão mais perigosa do repo; há cenário de verificação manual para ela.
- **Catálogo e tela de Estoque passam a mostrar números diferentes, de propósito.** Quem olhar as duas telas vai achar que uma está errada — daí a documentação.
- **Pedido abandonado sem pagamento segura estoque indefinidamente**: o livro pode aparecer ESGOTADO com exemplares na mão. O antídoto é cancelar o pedido (o cancelamento devolve tudo). Vale revisar os itens presos em `waiting-payment` da carga histórica da planilha.
- `sellable` tem **piso em 0** porque pedido além do estoque é permitido: o excedente não pode virar número negativo na vitrine.
- Unidade `committed` não altera o `remaining` do lote (ela não tem `lote_id` ainda).

## Alternativas descartadas

- **Fazer `available` descontar `waiting-payment`**: quebraria a confirmação de pagamento e a tela de Estoque de uma vez. Descartado por análise, antes de escrever código.
- **Descontar só na tag de estoque, mantendo ESGOTADO e o botão pelo número antigo**: número honesto sem impedir venda de exemplar em mão. O dono escolheu o comportamento mais conservador (descontar tudo, inclusive o ESGOTADO), aceitando que pedido não pago bloqueie a venda.
- **Bloquear a criação de pedido sem estoque**: contraria a regra fundadora do projeto (pedido nunca é bloqueado por falta de estoque; a falta virá para a futura tela de re-estoque).
