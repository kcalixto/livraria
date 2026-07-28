---
name: deploy-dev
description: Publica a livraria no ambiente DEV — deploy do backend (serverless) e/ou build+sync do frontend no S3 com invalidação do CloudFront. Use quando o usuário pedir para "subir pra dev", "deployar dev", "publicar em dev" ou depois de fechar um bloco de implementação que precisa de verificação em ambiente real. NUNCA use para prd.
---

# Deploy no dev

## Antes de rodar

- Testes e typecheck verdes nos dois pacotes (regra do repo). Se não rodou, rode.
- **Só dev.** Deploy de prd é push na `main` e depende de autorização explícita do dono.

## Armadilhas de ambiente (é aqui que se perde tempo)

- O shell default tem **Node 16** e o `serverless` exige 20: exporte o PATH em **toda** invocação.
- **`builtin npx` não existe** (`npx` é binário, não builtin do shell) — e o hook do GVM quebra `cd`. Por isso este rito roda como **script `zsh`**, não como comando encadeado.

## Execução

Escreva o script no diretório de scratchpad da sessão e execute com `zsh`. Rode em background: o deploy do backend leva ~40s e uma mudança na distribuição do CloudFront pode levar minutos.

```sh
#!/bin/zsh
set -e
export PATH="$HOME/.nvm/versions/node/v20.19.2/bin:$PATH"

# backend (pule se a mudança é só de front)
cd /Users/kaua.calixto/go/src/livraria/backend
npx serverless deploy --stage dev
echo "=== BACKEND OK ==="

# frontend
cd /Users/kaua.calixto/go/src/livraria/frontend
npx tsc -b && npx vite build --mode development >/dev/null
aws s3 sync dist/ s3://livraria-serverless-deployment-dev --delete --exclude "*.DS_Store"

# invalidação (o mesmo que o CI faz)
DIST=$(aws cloudformation describe-stacks --stack-name livraria-dev --region sa-east-1 \
  --query "Stacks[0].Outputs[?OutputKey=='SiteCdnId'].OutputValue" --output text)
ID=$(aws cloudfront create-invalidation --distribution-id "$DIST" --paths '/*' \
  --query 'Invalidation.Id' --output text)
aws cloudfront wait invalidation-completed --distribution-id "$DIST" --id "$ID"
echo "=== FRONT DEV PUBLICADO (cache invalidado) ==="
```

Notas:
- `--exclude "*.DS_Store"` evita republicar lixo do Finder (o CI já faz o mesmo).
- O build de dev é `vite build --mode development` (aponta pra API dev); `npm run build` é prd.
- A invalidação é rede de segurança: só `assets/*` tem cache na borda, e eles têm hash no nome.

## Verificação (obrigatória depois)

```sh
curl -sI https://dev-edicoes.zonasul.click/manoel-lisboa | head -3
```

Espere `HTTP/2 200` e `content-type: text/html`. Para conferir que o bundle novo subiu, extraia o nome do asset do HTML e confira que mudou. Verificação funcional é a skill `verificar-dev`.

## Restrições

- Não toque em `livraria-serverless-deplyment-prd` nem em `--stage prd`.
- Se o deploy criar/alterar recurso de CloudFront, o stack fica `UPDATE_IN_PROGRESS` por minutos: espere com um loop de `describe-stacks` em background, não com sleeps encadeados.
