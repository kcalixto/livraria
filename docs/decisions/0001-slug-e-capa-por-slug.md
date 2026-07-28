# 0001 — Slug do livro derivado no backend, e capa servida por ele

**Data:** 2026-07-28 · **Escopo:** [livros](../livros.md)

## Contexto

As capas eram nomeadas pelo uuid do livro (`<id>.jpg`), o que dava nomes ilegíveis no repo (`47aeb72f-5448-….jpg`) e uma listagem de arquivos impossível de conferir contra o acervo. O acervo tem dezenas de livros, a tabela só tem `id` como chave (sem GSI) e produção já estava no ar com 12 capas.

## Decisão

1. O livro ganha `slug` = kebab-case do título, **derivado no backend**. O cliente nunca escolhe: `slug` fica fora de `ALL_FIELDS`, então `body.slug` é ignorado pelo loop que copia campos.
2. Unicidade por sufixo numérico (`-2`, `-3`), conferida com Scan projetando `id, slug` no POST.
3. Teto de 60 chars cortando em **palavra inteira**; título só de símbolos cai no fallback `livro`.
4. **Editar o título regera o slug** (com `selfId` na checagem, senão o livro colide consigo mesmo).
5. A capa é `/images/<stage>/<slug>.jpg`, **sem fallback para o id**. Quem não tem slug cai no placeholder listrado, e o guard vive dentro do `CoverThumb`.
6. A renomeação dos arquivos `.jpg` é **manual**, guiada pelo mapa `id → slug` que `backfill-slug.mjs` imprime.

## Consequências

- Editar um título **quebra a capa** até alguém renomear o arquivo e deployar. O aviso do form de livro passou a mostrar o nome real do arquivo e a avisar disso.
- Carrinho salvo no `localStorage` antes da mudança não tem `slug` → miniatura no placeholder até o item ser re-adicionado.
- Dois POSTs simultâneos podem gerar slug duplicado (sem unique constraint no DynamoDB): duas capas apontariam pro mesmo arquivo. Risco **aceito** — um admin opera a livraria, e o efeito aparece na hora na tela Livros.
- Ordem obrigatória em produção: rodar o backfill **antes** do deploy é seguro (o bundle no ar ignora o campo `slug`); o inverso — bundle novo, banco sem slug, arquivos já renomeados — derruba **todas** as capas de uma vez.
- Um `slugify` duplicado (TS + a cópia no `.mjs`), com teste de paridade impedindo divergência.

## Alternativas descartadas

- **Fallback `slug ?? id` nas capas**: evitaria qualquer janela de placeholder, mas espalharia ternário por 7 call sites e exigiria um plano de deploy coordenado. O dono preferiu a janela de placeholder à complexidade.
- **Congelar o slug na criação** (não regerar ao editar o título): a capa nunca quebraria sozinha, mas o slug divergiria do título depois de uma correção. Escolha explícita do dono pelo slug sempre fiel ao título.
- **Sufixo com os 4 primeiros chars do uuid** para garantir unicidade sem Scan: mataria a legibilidade que motivou a mudança.
- **Copiar os arquivos em vez de renomear** (manter uuid e slug convivendo por um ciclo): zero janela de placeholder, ao custo de binários duplicados no histórico do git.
