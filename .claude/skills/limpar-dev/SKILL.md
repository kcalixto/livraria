---
name: limpar-dev
description: Limpa o ambiente de DEV da livraria — apaga pedidos/vendas e lotes/estoque (e os comprovantes de transação no S3), PRESERVANDO a tabela de livros. Use quando o usuário pedir para "limpar o dev", "resetar pedidos/lotes", "zerar o ambiente de desenvolvimento" ou antes de uma bateria de testes manuais.
---

# Limpeza do ambiente de dev

Zera os dados transacionais do DEV mantendo o catálogo:

| Alvo | Ação |
|---|---|
| `livraria-tb-pedidos-dev` (pedidos/vendas — linhas-unidade) | apagar tudo |
| `livraria-tb-lotes-dev` (lotes/estoque + transações) | apagar tudo |
| `s3://livraria-assets-bucket/dev/comprovantes/` (comprovantes pix das transações) | apagar tudo |
| `livraria-tb-livros-dev` | **NUNCA tocar** — o catálogo é preservado |

Efeito colateral esperado: sem lotes, o estoque real de todos os títulos vira 0 e o catálogo mostra tudo ESGOTADO até um novo lote ser registrado.

## Execução

```sh
export PATH="$HOME/.nvm/versions/node/v20.19.2/bin:$PATH"
node backend/scripts/clean-dev-tables.mjs
```

O script pagina o Scan, deleta em lotes de 25 (BatchWrite) e imprime a contagem por alvo. Requer credenciais AWS locais (`sa-east-1`).

## Verificação (obrigatória após rodar)

```sh
aws dynamodb scan --table-name livraria-tb-pedidos-dev --region sa-east-1 --select COUNT --query Count
aws dynamodb scan --table-name livraria-tb-lotes-dev --region sa-east-1 --select COUNT --query Count
aws dynamodb scan --table-name livraria-tb-livros-dev --region sa-east-1 --select COUNT --query Count  # deve ser > 0 (preservada)
```

## Restrições

- **Somente DEV.** Jamais aponte este fluxo para tabelas `-prd`. Se o usuário pedir limpeza de produção, pare e confirme explicitamente — não é o propósito desta skill.
- Não recriar dados aqui; seed de livros é outro fluxo (`backend/scripts/seed-mock-books.sh`).
