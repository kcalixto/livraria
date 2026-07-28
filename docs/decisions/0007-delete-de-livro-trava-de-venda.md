# 0007 — Delete de livro: da chave segmentada para a trava de venda

**Data:** 2026-07-28 · **Escopo:** [livros](../livros.md), [auth](../auth.md)

## Contexto

O `DELETE /backoffice/livros/:id` nasceu sem nenhuma validação de negócio: apagava direto. A proteção era toda de acesso — além do JWT admin, um segundo header (`x-admin-api-key`, chave em SSM) que o front nunca embarcou. O efeito prático: sem botão na interface, deletar era um ritual de curl reservado a quem detinha a chave. A fricção **era** a guarda.

O dono pediu o botão de deletar na tela de edição — e um botão no front não tem como carregar uma chave que é secreta por definição. Manter as duas coisas era impossível; abrir a rota sem substituir a guarda, inaceitável.

## Decisão

1. A guarda de acesso vira **guarda de negócio**: a rota responde **409** se existir **qualquer** linha na tabela de pedidos com aquele `title_id` — qualquer status, incluindo `waiting-payment` e `cancelled` ([backoffice-livros.ts:151](../../backend/src/routes/backoffice-livros.ts), Scan paginado; um miss de página liberaria deletar título vendido).
2. **Título com pedido é imortal.** Pedidos, Vendas e a consulta pública resolvem o nome do livro pelo `title_id`; deletar o livro quebraria esse histórico. O caminho para tirar um título da loja é **arquivar** (`state: archived`), nunca deletar.
3. O header `x-admin-api-key` sai: middleware apagado, env removida do `serverless.yml`. A rota fica atrás de `requireRole('admin')`, como toda escrita.
4. O botão vive no form de edição, atrás do `DangerConfirmModal`; com venda, fica desabilitado com tooltip explicando.

## Consequências

- O parâmetro SSM `/livraria/backoffice-admin-api-key` vira órfão na AWS — apagar ou manter é decisão do dono (registrado no backlog do `CLAUDE.md`).
- Deletar só alcança título que nunca vendeu: erro de cadastro, duplicata, teste. É exatamente o caso do `DELETE` como "correção de dado errado" — coerente com o delete de pedido (ADR [0004](0004-edicao-administrativa-e-timestamps.md)).
- A receita de curl continua funcionando (agora sem a segunda chave); a skill `verificar-dev` foi atualizada.
- Até o redeploy, o ambiente no ar continua exigindo a chave antiga.

## Alternativas descartadas

- **Manter a rota com chave e criar uma segunda rota para o front**: duas formas de deletar, uma delas sem a trava de venda — a chave viraria um bypass do 409, e o risco que a trava elimina (quebrar histórico) voltaria pela porta dos fundos.
- **Checar só unidades vendidas/finalizadas**: liberaria deletar título com pedido aguardando pagamento ou cancelado — mas essas linhas também referenciam o `title_id` na fila e na consulta pública; o nome do livro sumiria delas do mesmo jeito.
- **GSI por `title_id`** em vez de Scan: a tabela é pequena e o delete é raro; um índice permanente para uma checagem eventual não se paga.
