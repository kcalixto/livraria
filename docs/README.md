# docs — mapa do código, o porquê e as armadilhas

As **regras** vivem no [`CLAUDE.md`](../CLAUDE.md) da raiz, que é sempre carregado. Estes arquivos carregam o que ele não tem:

- **onde** cada coisa está no código (com `file:line`),
- **por que** a regra é assim (e o que ela protege),
- os **gotchas** que já custaram retrabalho,
- a **receita de verificação** de cada escopo.

Nenhum doc aqui reescreve uma regra. Se algum contradisser o `CLAUDE.md`, o `CLAUDE.md` ganha e o doc está desatualizado — corrija-o.

## Escopos

| Doc | Cobre | Núcleo do código |
|---|---|---|
| [loja.md](loja.md) | catálogo/vitrine, carrinho, pedido enviado, consulta pública | `frontend/src/pages/{Catalogo,Carrinho,ConsultarPedido}.tsx` · `backend/src/routes/{livros,pedidos}.ts` |
| [pedidos.md](pedidos.md) | fila do backoffice, transições por unidade, edição administrativa, Vendas | `frontend/src/pages/backoffice/Pedidos.tsx` (877) · `backend/src/routes/backoffice-pedidos.ts` (521) |
| [estoque-e-lotes.md](estoque-e-lotes.md) | motor de estoque, alocação FIFO, lotes, transações, observação | `backend/src/lib/stock.ts` · `backend/src/routes/backoffice-lotes.ts` |
| [livros.md](livros.md) | CRUD, slug, capas, preço social | `backend/src/routes/backoffice-livros.ts` · `backend/src/lib/slug.ts` |
| [auth.md](auth.md) | api key global, JWT por perfil, `requireRole`, guards do front | `backend/src/middlewares/` · `frontend/src/backoffice/auth.ts` |
| [infra.md](infra.md) | serverless.yml, domínio/CloudFront, certificado, backup, CI/CD, deploy | `backend/serverless.yml` · `.github/workflows/deploy.yml` |
| [ui.md](ui.md) | convenções de UI, índice do `styles.css`, armadilhas de layout | `frontend/src/styles.css` (3.000+) · `frontend/src/components/` |
| [testes.md](testes.md) | convenções de teste e armadilhas de mock | 39 arquivos de teste, 334 casos |

## Transversais

- [decisions/](decisions/) — decisões estruturais datadas (contexto → decisão → consequência → alternativas descartadas).
- [observability.md](observability.md) — como investigar produção (sintoma → onde olhar).
- [self-improvement.md](self-improvement.md) — o protocolo que impede estes docs de apodrecerem.

## Concentração da complexidade (onde pisar com cuidado)

Quase 20% do código autoral está numa área só: `Pedidos.tsx` (877) + `backoffice-pedidos.ts` (521) = 1.398 linhas de fonte e 1.904 de teste. Depois vem Lotes/Estoque (`LoteDetail.tsx` 433, `LoteForm.tsx` 340, `backoffice-lotes.ts` 301). `styles.css` (3.000+) é o único arquivo global gigante e atravessa todas as telas.

## Gaps desta estrutura

Anote aqui o que a estrutura não cobriu bem, em vez de improvisar em silêncio.

- `styles.css` não tem dono: nenhum doc de escopo "possui" o arquivo, então `ui.md` virou o índice dele. Se um dia ele for quebrado por área, este mapa muda.
- Vendas não tem rota própria (deriva de `GET /backoffice/pedidos`), então vive dentro de `pedidos.md` em vez de ter doc próprio.
- Não há lint de markdown nem validação automática dos `file:line` — a veracidade dos ponteiros é conferida à mão (ver a receita em cada doc).
