# Protocolo: manter estes docs vivos

Documentação de projeto pequeno apodrece por um motivo só: ninguém sabe **quando** atualizá-la. Este arquivo define os gatilhos. O resumo está no [`CLAUDE.md`](../CLAUDE.md); aqui fica o detalhe.

## Gatilho → ação

| Quando | Faça | Onde |
|---|---|---|
| Mudou comportamento de um escopo | Atualize o doc do escopo. Se a **regra** mudou, atualize o `CLAUDE.md` também | `docs/<escopo>.md` + `CLAUDE.md` |
| Tomou decisão estrutural, ou descartou uma alternativa por um motivo que não é óbvio | Novo ADR | `docs/decisions/` |
| Perdeu tempo com uma armadilha (mock, layout, ambiente) | Registre o gotcha **com `file:line`** | doc do escopo dono |
| Descobriu que um doc contradiz o código | O código ganha: corrija o doc | onde estiver |
| Rota nova no backoffice | `requireRole` + entrada na matriz `backoffice-roles.test.ts` + linha em `docs/auth.md` | — |
| Campo novo no DynamoDB | Atualize o bullet de Dados no `CLAUDE.md` e o doc do escopo | — |
| Script novo em `scripts/` | Cabeçalho explicando o porquê + linha no `README.md` | — |
| A própria estrutura não cobriu seu caso | Anote em "Gaps" no fim de `docs/README.md` em vez de improvisar em silêncio | `docs/README.md` |

## Fim de sessão (checklist de 30 segundos)

Se a sessão mexeu em código de produção:

1. A regra mudou? → `CLAUDE.md`.
2. Aprendi algo que me custou tempo? → gotcha no doc do escopo, com `file:line`.
3. Decidi algo que alguém vai querer reverter sem saber o porquê? → ADR.
4. Algum `file:line` que eu citei antes mudou de lugar? → conferir e corrigir.

## Auditoria (rodar de vez em quando)

### O que é automático

```sh
node scripts/check-docs.mjs
```

Checa o que não exige julgamento: todo link resolve, toda linha citada no rótulo (`[arquivo.ts:NN]`) existe no arquivo, e nenhuma regra do `CLAUDE.md` foi copiada para um doc de escopo. Sai com código != 0 se achar problema. Os trechos de regra são derivados do próprio `CLAUDE.md` a cada execução, então a checagem não apodrece junto com o texto.

### O que continua manual (e por quê)

- **A linha citada ainda FAZ o que o doc afirma?** Isso exige julgamento — um checador que só confirma "a linha existe" dá falsa segurança. Confira por amostragem com `grep -n` nas âncoras do escopo que você tocou. Doc que aponta pra linha errada é pior que doc ausente.
- **Escopo órfão**: área nova no código sem doc em `docs/`.
- **Skill defasada**: os comandos das skills de rito ainda funcionam? `deploy-dev` e `verificar-dev` são executáveis — rodar **é** a verificação.
- **Backlog resolvido**: item do backlog do `CLAUDE.md` que já foi feito e ninguém removeu.
