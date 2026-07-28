# Decisões (ADRs)

Uma entrada por decisão **estrutural** — aquela que alguém, seis meses depois, vai querer reverter sem saber o que ela protegia.

Formato fixo e curto: **Contexto · Decisão · Consequências · Alternativas descartadas**. Data no cabeçalho. ADR não se edita para mudar de opinião: escreve-se uma nova que supera a anterior (e a antiga ganha uma linha "Superada por").

O que **não** vira ADR: regra de negócio (vive no [`CLAUDE.md`](../../CLAUDE.md)), detalhe de implementação (vive no doc do escopo), preferência de estilo.

| ADR | Assunto |
|---|---|
| [0001](0001-slug-e-capa-por-slug.md) | slug do livro derivado no backend e capa servida por ele |
| [0002](0002-dois-numeros-de-estoque.md) | `available` operacional × `sellable` da vitrine |
| [0003](0003-dominio-e-caminho-do-coletivo.md) | domínio próprio e caminho do coletivo na borda |
| [0004](0004-edicao-administrativa-e-timestamps.md) | correção de histórico sem tocar `created_at`/`updated_at` |
| [0005](0005-cancelamento-por-item-irreversivel.md) | cancelamento por item, terminal |
| [0006](0006-waf-fora-deste-stack.md) | não fazer WAF agora (e por quê) |
