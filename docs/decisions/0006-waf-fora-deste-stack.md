# 0006 — Não fazer WAF agora (e por que ele não cabe aqui)

**Data:** 2026-07-28 · **Escopo:** [infra](../infra.md) · **Status:** decisão de não-fazer

## Contexto

O site ganhou CloudFront e domínio próprio, o que abriu a porta para WAF e throttling. Duas superfícies seguem sem proteção real: o **código público de 6 chars** da consulta de pedido (força-brutável) e o **`POST /pedidos`** (flood). Hoje a mitigação é barata: limites de payload, 404 pré-query para código malformado, e a api key como fricção anti-bot (que não é segredo — embarca no bundle).

## Decisão

**Não implementar WAF nesta leva.** Registrar o impedimento e o caminho.

O impedimento é estrutural: **Web ACL de escopo CLOUDFRONT só existe em `us-east-1`**, e o `serverless.yml` deste projeto é `sa-east-1`. Uma stack não cria recurso em outra região, então WAF exigiria uma stack própria — o mesmo problema que o certificado ACM já resolveu com `backend/infra/site-cert.yml`.

E há um segundo fato que muda a ordem do trabalho: **a API não está atrás do CloudFront**. Ela responde direto no `execute-api`. Colocar WAF só na distribuição do site protegeria o HTML e as capas — não as rotas que estão expostas. O passo que realmente move a agulha é **pôr a API atrás do CloudFront** primeiro; o WAF vem depois, de graça.

## Consequências

- Brute-force do código de pedido e flood de `POST /pedidos` seguem possíveis. O dano é limitado (a consulta pública não expõe PII — nem nome, nem contato, nem valores) e o custo de um flood é o do DynamoDB PAY_PER_REQUEST, sem alarme configurado ainda.
- Fica no backlog, com a ordem certa: (1) API atrás do CloudFront, (2) WAF de escopo CLOUDFRONT em stack `us-east-1`, (3) alarme de custo/consumo do DynamoDB.
- Este ADR existe para ninguém "redescobrir" o impedimento de região daqui a meses e concluir, errado, que é só adicionar um recurso no `serverless.yml`.

## Alternativas descartadas

- **WAF de escopo REGIONAL no execute-api**: é possível em `sa-east-1` e protegeria a API hoje. Descartado por ordem, não por mérito — colocar a API atrás do CloudFront primeiro deixa uma única borda para proteger, em vez de duas configurações de WAF para manter.
- **Throttling do API Gateway como paliativo**: ajuda contra flood, mas não contra brute-force distribuído, e limite global também derruba o uso legítimo do backoffice.
- **Aumentar o tamanho do código do pedido** (de 6 para 10 chars): reduziria a força-brutabilidade, mas quebra os códigos já entregues a clientes e o `AJ3-C9K` que o dono usa na comunicação.
