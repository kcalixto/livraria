# Livraria Local — contexto para agentes

Livraria **social, sem fim de lucro**, de um coletivo local. Catálogo público focado nas descrições dos livros, carrinho anônimo (nome/vulgo + contato, sem cadastro) e backoffice de gestão. Monorepo: `frontend/` (Vite + React TS → S3 static website) e `backend/` (Node 20 TS, Hono numa única Lambda via Serverless Framework v3, DynamoDB, `sa-east-1`).

## Regras de negócio (a alma do projeto — não violar)

- **Operação por lotes, caixa negativo por opção**: a livraria compra um lote de livros, vende, e compra o próximo antes de terminar de vender o atual. Não é orientada a lucro. No futuro, saldo positivo será retirado do caixa como **doação a projetos sociais** (precisará de registro próprio).
- **A venda é por TÍTULO/UNIDADE, nunca por pedido**: o pedido é só um agrupador de entrega para uma pessoa. Cada unidade física é uma linha própria (`unit_id`) com status independente.
- **Valor recebido é informado pelo vendedor por unidade** ao confirmar pagamento (`received_amount`, centavos): doadores às vezes pagam mais que o preço (ou menos). O código NUNCA distribui valores automaticamente entre títulos ou lotes.
- **Pedidos nunca são bloqueados por falta de estoque**: a criação não valida nem aloca estoque; pedidos além do estoque ficam em `waiting-payment` indefinidamente e visíveis na listagem (futura tela de "re-estoque" listará esses casos para compra).
- **Estoque real deriva de Lotes** (compras registradas com data, região, livros+quantidades e custo total). Saldo por livro está sempre vinculado a **Região + Lote**. Alocação de unidade→lote é FIFO (lote mais antigo da região) e acontece na TRANSIÇÃO para estado que deduz estoque, não na criação do pedido.
- **Estados que deduzem estoque**: `in-reserve`, `payment-received`, `sent-to-delivery`, `received`, e qualquer unidade `picked_up` (retirada sem pagamento — prática aceita da livraria social).
- **Toda ação administrativa é reversível** (erro humano acontece): liberar reserva volta a `waiting-payment`; desfazer retirado-sem-pagamento idem; ambos devolvem a unidade ao lote.
- **Fluxo de status por unidade**: o fluxo NORMAL é `waiting-payment → payment-received → sent-to-delivery → received` (4 estágios). `in-reserve` é estado **excepcional** (como o `picked_up`): mesma posição do waiting, apenas deduz estoque — transições `waiting ↔ in-reserve` e `in-reserve → payment-received`. Unidade `picked_up`: só `waiting-payment → payment-received` (finaliza; o front exibe como entregue). **Finalizada** (aba Vendas) = `received` OU (`picked_up` + `payment-received`). `paid_at` é gravado ao confirmar pagamento (relatórios/CSV).
- **Lotes têm transações** (`transactions[]` no item): valor com sinal em centavos (negativa = doação a instituição/perda; positiva = contribuição posterior), destinatário, data e comprovante pix opcional (png/jpg/pdf ≤5MB) salvo PRIVADO em `livraria-assets-bucket/<stage>/comprovantes/` — leitura só por URL pré-assinada via backend. **Saldo do lote = vendido + transações − custo**. O custo do lote é CALCULADO no form (Σ preço de catálogo × qtd).
- **Exclusão de livro é segmentada**: `DELETE /backoffice/livros/:id` exige, além do JWT, o header `x-admin-api-key` (env `BACKOFFICE_ADMIN_API_KEY`, SSM `/livraria/backoffice-admin-api-key`) — sem botão no front, só via curl por quem detém a chave.
- **Preços/valores sempre em centavos** (int). Código do pedido: 6 chars alfanuméricos maiúsculos, exibido `AJ3-C9K`; o cliente é avisado para guardar (não há outra consulta).

## Arquitetura e convenções

- **Dados** (PAY_PER_REQUEST, `Retain`): `livraria-tb-livros-{stage}` (hash `id` uuid; title, description?, price, author?, pages?, edition?, year?, format?, timestamps — TUDO snake_case inglês); `livraria-tb-pedidos-{stage}` (hash `id` = código do pedido, range `book_id` = **`${title_id}#${unit_id}`** composto; atributos `title_id`, `unit_id`, name, contact, region, status, `lote_id?`, `received_amount?`, `picked_up?`, timestamps; GSI `status-index`); `livraria-tb-lotes-{stage}` (hash `id` uuid; date, region, books[{book_id, amount}], total_cost).
- **Auth em duas camadas**: `x-api-key` global em TODAS as rotas (env `LIVRARIA_FRONT_END_API_KEY`, SSM `/livraria/front-end-api-key`; embarcada no bundle via `VITE_API_KEY` — **não é segredo**, é fricção anti-bot; futuras chaves segmentarão acesso) + **JWT 1h** pro backoffice (senha SSM `/livraria/backoffice-key` → `POST /backoffice/login`; secret `/livraria/jwt-secret`). SSM resolvido em deploy-time (rotação = redeploy). CORS resolvido no Hono (não no httpApi).
- **Capas**: `frontend/public/images/<stage>/<id-do-livro>.jpg` — servidas junto do site (sem bucket de assets); capa nova exige build/deploy. Comprimir com `frontend/scripts/compress-covers.sh` (teto 200KB). Fallback listrado quando não existe.
- **Região**: única ativa "SP, Capital - Zona Sul" (valor de API sem travessão; exibição com travessão em `frontend/src/lib/region.ts`); demais aparecem "em breve".
- **Estoque exibido no catálogo**: `amount` real por região; `amount === 0` → ESGOTADO (esgotados vão pro fim da lista, ordenação estável no front); catálogo ordenado por `created_at` desc no back.
- **Design**: fonte da verdade no projeto Claude Design "Livraria local design system" (tokens em `frontend/src/styles.css`: Newsreader + IBM Plex Mono, paleta papel/tinta/vinho `#7a1f1a`).
- **Ambientes**: dev (`https://a07s4i4gvb.execute-api.sa-east-1.amazonaws.com`) e prd (`https://l674u4xyoj.execute-api.sa-east-1.amazonaws.com`); sites nos buckets `livraria-serverless-deployment-dev` / `livraria-serverless-deplyment-prd` (typo do prd é real). Deployment bucket: `kcalixto-serverless-framework`. CI/CD: push `development`→dev, `main`→prd.
- **Metodologia**: TDD estrito (teste RED antes de qualquer código de produção; vitest nos dois pacotes; back usa aws-sdk-client-mock). `npm test` e `npm run check` (tsc) devem passar antes de commit. Deploy dev para verificação via curl/browser após cada bloco. Push na main = deploy prd — só com autorização explícita do dono.
- **Ambiente local**: shell default tem Node 16 e o hook do GVM quebra `cd` — usar `export PATH="$HOME/.nvm/versions/node/v20.19.2/bin:$PATH"` e `builtin cd`/`npm --prefix`.

## Backlog conhecido (não implementar sem pedir)

Tela de "re-estoque" (pedidos aguardando sem estoque); registro de doações de saldo positivo; múltiplas regiões; CloudFront + WAF + throttling/budget (mitigação DDoS/custo — lista completa no plano); GSI para consultas quando Scan doer.
