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

O que varrer, e o comando que responde:

- **Ponteiro apodrecido**: cada `file:line` citado nos docs ainda aponta pro que o doc afirma?
  ```sh
  grep -rno '](\.\./[^)]*\.\(ts\|tsx\|css\|yml\)' docs/ | head -40   # lista as referências
  ```
  Conferir por amostragem com `grep -n` no arquivo citado. Doc que aponta pra linha errada é pior que doc ausente.
- **Regra duplicada**: alguma frase imperativa do `CLAUDE.md` foi reescrita num doc de escopo? Se sim, apague do escopo e deixe o link.
- **Escopo órfão**: área nova no código sem doc em `docs/`.
- **Skill defasada**: os comandos das skills de rito ainda funcionam? (`deploy-dev` e `verificar-dev` são executáveis — rodar é a verificação.)
- **Backlog resolvido**: item do backlog do `CLAUDE.md` que já foi feito e ninguém removeu.

## Por que não há automação

Nem lint de markdown, nem validação automática dos `file:line`. A veracidade dos ponteiros exige julgamento ("a linha ainda faz o que o doc diz?"), e um linter que só checasse existência de arquivo daria falsa segurança. Se um dia doer, o caminho é um script que extrai as referências e falha quando o arquivo citado não contém mais o símbolo mencionado.
