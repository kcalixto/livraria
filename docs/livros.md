# Livros — CRUD, slug e capas

> Regras: [`CLAUDE.md`](../CLAUDE.md) (slug, capas, preço social, exclusão segmentada). Aqui: onde está, por quê e as armadilhas.

## Slug: derivado no backend, nunca vindo do cliente

`backend/src/lib/slug.ts` — `slugify` ([slug.ts:8](../backend/src/lib/slug.ts)): NFD → tira diacríticos → lowercase → `[^a-z0-9]+ → '-'` → apara hífens de borda. Teto de 60 (`MAX_SLUG_LENGTH`, [slug.ts:4](../backend/src/lib/slug.ts)) **cortando em palavra inteira** ([slug.ts:19](../backend/src/lib/slug.ts)) — corte cego produziria `...economia-politic`. Título só de símbolos cai em `livro` ([slug.ts:15](../backend/src/lib/slug.ts)).

O charset é restrito a `[a-z0-9-]` de propósito: o slug vira nome de arquivo, chave de S3 e path de CloudFront — nada que precise de encoding.

**Como o cliente é impedido de escolher o slug** ([backoffice-livros.ts:74-84](../backend/src/routes/backoffice-livros.ts)): o slug entra no objeto ao lado de `id`/`created_at`, e o loop que copia campos do body só percorre `ALL_FIELDS` — onde `slug` **não está**. Então `body.slug` é silenciosamente ignorado. Não é validação; é ausência de caminho.

**Unicidade** (`uniqueSlug`, [backoffice-livros.ts:31](../backend/src/routes/backoffice-livros.ts)): Scan projetando só `id, slug`, monta o conjunto de tomados ignorando o próprio id, e sufixa `-2`, `-3`… O Scan cabe numa página (dezenas de livros). **Risco aceito e documentado no código**: dois POSTs simultâneos podem gerar slug duplicado — DynamoDB não tem unique constraint sem tabela auxiliar, e a livraria opera com um admin. Se acontecer, duas capas apontam pro mesmo arquivo e isso aparece na hora na tela Livros.

**Editar o título regera o slug** ([backoffice-livros.ts:121-123](../backend/src/routes/backoffice-livros.ts)). O `selfId` é obrigatório: sem ele o livro colidiria consigo mesmo e viraria `-2` a cada save. Consequência assumida: o arquivo da capa continua com o nome velho e a capa **cai no placeholder** até alguém renomear o `.jpg` no repo — por isso o aviso do form mostra o nome real do arquivo (`LivroForm.tsx`, bloco `.livro-form__cover-note`).

## Capas: sem fallback

`frontend/src/lib/covers.ts` monta `/images/<stage>/<slug>.jpg`. **Não há fallback `slug ?? id`** — decisão explícita do dono: renomear os arquivos é passo manual e ficar um tempo no placeholder listrado é aceitável, o que evita ternário espalhado por 7 call sites e um plano de deploy coordenado.

Quando não há slug (livro pré-migração, item de carrinho antigo), `CoverThumb` renderiza direto o placeholder — a prop é `slug: string | undefined` e o guard vive **dentro** do componente, não nos call sites.

Os 7 consumidores e como cada um obtém o slug:

| Tela | Origem do slug |
|---|---|
| `components/LivroEntry.tsx` (catálogo) | tem o `Book` |
| `pages/backoffice/Livros.tsx` | tem o `Book` |
| `pages/Carrinho.tsx` | `item.slug` (gravado no `localStorage` ao adicionar) |
| `pages/backoffice/Estoque.tsx` | `Map<id, slug>` montado do `GET /livros` que a tela já busca |
| `pages/backoffice/LoteDetail.tsx` | idem |
| `pages/backoffice/PedidoEdit.tsx` e `PedidoItemEdit.tsx` | `books.get(title_id)?.slug` via `useOrders` |

Carrinho salvo **antes** da migração não tem `slug` → miniatura no placeholder até o item ser re-adicionado. Aceito.

## Migração do acervo

`backend/scripts/backfill-slug.mjs` — Scan completo **antes** de gravar (a unicidade depende do conjunto inteiro), ordem determinística por `created_at`+`id` (dry-run e execução real distribuem os sufixos igual), idempotente por `attribute_not_exists`, `--dry-run`, e imprime o mapa `id → slug` em stdout com as contagens em stderr. É esse mapa que guia a renomeação manual dos `.jpg`.

O `slugify` está **duplicado** dentro do script (é `.mjs`, não importa TS). A divergência é barrada por teste: `backend/src/lib/slug.test.ts` importa a cópia do script e compara com a função real numa lista de títulos.

Ordem segura em produção — e por quê: rodar o backfill **antes** do deploy é seguro porque o bundle no ar ignora o campo `slug`; o inverso (bundle novo + banco sem slug + arquivos já renomeados) derruba **todas** as capas. Ver [`decisions/0001-slug-e-capa-por-slug.md`](decisions/0001-slug-e-capa-por-slug.md).

## State: active / archived

O livro tem `state` (`active` | `archived`), validado em POST e PUT por `invalidState` ([backoffice-livros.ts:22](../backend/src/routes/backoffice-livros.ts)) — valor fora da lista é 400. POST grava `active` no objeto base ([backoffice-livros.ts:78](../backend/src/routes/backoffice-livros.ts)), então livro novo nasce visível; o campo entrou em `OPTIONAL_FIELDS`, então o PUT atualiza pelo mesmo UpdateExpression dinâmico dos demais.

**Ausência de `state` = active** — é o que dispensa backfill do acervo legado. O filtro vive no `GET /livros` ([livros.ts:22](../backend/src/routes/livros.ts)): a vitrine só recebe active, e `?state=all` devolve o acervo inteiro. Quem precisa do `all`: as telas do backoffice (um livro arquivado continua tendo estoque físico e histórico) e a consulta pública de pedido (o nome de um título arquivado não pode sumir de um pedido antigo). Armadilha: qualquer valor de `?state` que não seja `all` cai no default silenciosamente — não há validação do param, de propósito (contrato mínimo dos testes).

No front, **todo consumidor de `GET /livros` fora do catálogo usa `?state=all`** — são 7 call sites (Livros, Estoque, LoteForm, LoteDetail, `useOrders`, ConsultarPedido e o próprio LivroForm); só `pages/Catalogo.tsx` fica no default. O do LivroForm é o menos óbvio: sem ele, livro arquivado não abre no form e **nunca pode ser reativado**. O select Estado (`livro-form__state--active|archived`, verde/cinza) só existe ao editar, e a listagem Livros marca arquivado com o mesmo badge do "sem capa".

## Exclusão com trava de venda

`DELETE /backoffice/livros/:id` (JWT admin) passa por `titleHasOrders` ([backoffice-livros.ts:151](../backend/src/routes/backoffice-livros.ts)): Scan **paginado** na tabela de pedidos com `FilterExpression: title_id = :t` — o loop de `LastEvaluatedKey` importa porque um miss de página liberaria deletar título vendido. Achou linha (qualquer status) → `409 {error: 'title has orders'}` sem tocar o banco. História e alternativas descartadas: [0007](decisions/0007-delete-de-livro-trava-de-venda.md).

No front o botão "Deletar livro" vive no `LivroForm` (só ao editar), atrás do `DangerConfirmModal`. A trava é espelhada: o form busca `GET /backoffice/pedidos` e trava o botão se alguma unidade tem o `title_id`. **Gotcha do tooltip**: o botão usa `aria-disabled` + guard no onClick (nunca `disabled` — `button[disabled]` não dispara hover) e o texto vem de `data-tooltip`, não `aria-label` — num botão com texto visível o `aria-label` sobrescreveria o nome acessível. O CSS (`livro-form__delete`) replica a receita do `.action-icon::after`. Enquanto a checagem não resolve (`hasSale === null`), o botão fica travado sem tooltip; o 409 do backend cobre a corrida (o form mostra o erro no lugar de navegar).

## Verificação deste escopo

```sh
npm --prefix backend test -- --run slug backoffice-livros livros
npm --prefix frontend test -- --run Livros LivroForm covers
```

Por curl (a skill `verificar-dev` faz isso): criar livro com título acentuado e conferir o slug derivado; criar um segundo com o **mesmo** título e conferir o `-2`; mandar `slug` no body e conferir que foi ignorado.
