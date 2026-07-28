---
name: verificar-dev
description: Bateria de verificação funcional da API em DEV por curl — slug, estoque líquido da vitrine, a regressão de alocação de lote no pagamento, e observação de lote. Use depois de um deploy dev, ou quando o usuário pedir para "verificar o dev", "testar ponta a ponta", "conferir se está tudo certo em dev".
---

# Verificação funcional em dev

Prova o que teste unitário não pega: integração real com DynamoDB, efeito de estoque e as rotas de escrita. **Cria dados de teste e os apaga no fim** — a limpeza é parte do rito, não opcional.

## Preparação

```sh
export PATH="$HOME/.nvm/versions/node/v20.19.2/bin:$PATH"
API=https://a07s4i4gvb.execute-api.sa-east-1.amazonaws.com
KEY=$(grep VITE_API_KEY /Users/kaua.calixto/go/src/livraria/frontend/.env.development | cut -d= -f2)
PASS=$(aws ssm get-parameter --name /livraria/backoffice-key --with-decryption \
  --query 'Parameter.Value' --output text --region sa-east-1)
TOKEN=$(curl -s -X POST "$API/backoffice/login" -H "x-api-key: $KEY" \
  -H 'content-type: application/json' -d "{\"password\":\"$PASS\"}" \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
```

**Nunca imprima `$PASS` nem `$TOKEN`** — pipe direto para variável, sem `echo`.

## O que verificar

1. **`GET /livros`** — tem `slug`, `amount` é o líquido, e **não** tem `status` (campo removido).
2. **POST de livro** — o slug é derivado do título (mande `slug` no body e confirme que foi **ignorado**); um segundo livro com o mesmo título vira `-2`.
3. **Estoque comprometido** — crie um pedido e **não** pague:
   - `GET /livros` → o `amount` do título caiu 1;
   - `GET /backoffice/estoque` → o `available` do mesmo título **não** mudou.
4. **A regressão mais perigosa do repo** — confirme o pagamento dessa unidade:
   - `PATCH /backoffice/pedidos/:id/status` com `{unit_id, status: 'payment-received', received_amount}` responde **200**;
   - a unidade sai com **`lote_id` preenchido**.
   Se isso falhar, alguém mexeu em `available` — ver `docs/decisions/0002-dois-numeros-de-estoque.md`.
5. **Observação de lote** — `POST /backoffice/lotes` com `observation` grava aparada; linha com `amount: 0` é descartada; `PATCH /backoffice/lotes/:id` edita; observação vazia **remove** o atributo; 201 chars dá **400**.

Escreva tudo num script `zsh` no scratchpad e rode de uma vez — as etapas dependem dos ids das anteriores. Use `node -pe` para extrair campos do JSON (sem `jq`, que pode não existir).

## Limpeza (parte do rito)

```sh
# pedidos de teste (filtre pelo nome que você usou)
curl -s -X DELETE "$API/backoffice/pedidos/<ID>" -H "x-api-key: $KEY" -H "authorization: Bearer $TOKEN"

# livros de teste exigem a segunda chave
ADMIN=$(aws ssm get-parameter --name /livraria/backoffice-admin-api-key --with-decryption \
  --query 'Parameter.Value' --output text --region sa-east-1)
curl -s -X DELETE "$API/backoffice/livros/<ID>" -H "x-api-key: $KEY" \
  -H "authorization: Bearer $TOKEN" -H "x-admin-api-key: $ADMIN"

# lote de teste: NÃO existe rota de delete de lote — apague o item na tabela dev
aws dynamodb delete-item --region sa-east-1 --table-name livraria-tb-lotes-dev \
  --key '{"id":{"S":"<LOTE_ID>"}}'
```

Confira que sobrou zero antes de dizer que terminou. Se precisar zerar tudo, existe a skill `limpar-dev`.

## Restrições

- **Só dev.** Nada de apontar para o endpoint de prd.
- Use nomes de teste reconhecíveis (ex.: "Teste …") para a limpeza poder filtrar.
- Dado fictício sempre: nunca use nome/contato de pessoa real.
