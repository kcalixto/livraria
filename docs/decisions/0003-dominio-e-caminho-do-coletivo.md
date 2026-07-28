# 0003 — Domínio próprio e caminho do coletivo resolvidos na borda

**Data:** 2026-07-28 · **Escopo:** [infra](../infra.md), [loja](../loja.md)

## Contexto

O site era divulgado pela URL do endpoint de website do S3 (`http://…s3-website-sa-east-1.amazonaws.com`) — sem HTTPS, sem cara de endereço. O dono comprou `zonasul.click` no Route 53 e definiu os endereços: `https://edicoes.zonasul.click/manoel-lisboa` (prd) e `dev-edicoes…` (dev). O caminho existe porque o domínio deve comportar **outros coletivos** no futuro, cada um no seu caminho.

## Decisão

1. CloudFront por stage (`SiteCdn`) com origem no endpoint de website do bucket (`http-only`: o TLS termina na borda), alias do domínio e registros A+AAAA criados pelo próprio stack (`SiteDns`).
2. O **caminho** é resolvido por uma CloudFront Function em viewer-request (`SiteRouter`): raiz → **302** pro caminho, `/manoel-lisboa` → `index.html`, `/manoel-lisboa/*` → tira o prefixo antes de ir ao bucket.
3. O bundle e as capas continuam na **raiz** do bucket — Vite `base` segue `/` e o CI não muda.
4. No front, `siteBasename()` deriva o basename do `window.location.pathname`: sob o caminho usa `/manoel-lisboa`, fora dele usa `/`.
5. O certificado wildcard `*.zonasul.click` vive num stack separado em `us-east-1` (`backend/infra/site-cert.yml`), com o ARN entrando por SSM.

## Consequências

- **302 e não 301**: se a raiz do domínio um dia virar um índice de coletivos, nenhum navegador fica com redirect permanente em cache. Custo: um redirect não-cacheável por visita à raiz.
- **O certificado é um passo manual, uma vez** — e é o único artefato de infra fora do `serverless.yml`. Mudar de domínio exige reaplicar aquele template e atualizar o SSM.
- **A função roda em `cloudfront-js-2.0`, que é ES5.1+**: sem template literal, sem `startsWith`. Código que passa no lint local pode falhar na borda.
- O basename derivado do pathname mantém a **origem S3 legada** e o `vite dev` funcionando na raiz — foi o que evitou quebrar a URL antiga que já estava em uso.
- Adicionar um coletivo novo = novo caminho: mexer em `custom.sitePath` + basename, ou generalizar a função para vários prefixos.
- O fallback SPA (404 → `index.html` com 200) faz **qualquer** caminho inexistente responder 200 com HTML, inclusive asset com nome errado. Atrapalha diagnóstico; conhecido e aceito.

## Alternativas descartadas

- **Servir o site de dentro de um prefixo no bucket** (`s3://bucket/manoel-lisboa/`) com `base` do Vite: exigiria mexer no CI e, no endpoint de website do S3, um acesso sem barra final devolve 302 com o host da origem — vazando a URL do bucket.
- **WAF junto**: escopo CLOUDFRONT exige stack em `us-east-1` — ver [0006](0006-waf-fora-deste-stack.md).
- **Certificado no mesmo stack**: impossível, CloudFront só aceita ACM de `us-east-1` e uma stack não cria recurso em outra região.
