# frontend — como mexer aqui

Vite + React TS, servido do S3 atrás do CloudFront. As **regras de negócio** estão no `CLAUDE.md` da raiz; este arquivo é só o que é específico deste pacote.

## Comandos

```sh
npm run dev       # localhost:5173, aponta pra API dev
npm test          # vitest + @testing-library/react (jsdom)
npm run check     # tsc -b --noEmit
npm run build     # produção (injeta a CSP via <meta>)
```

## Armadilhas deste pacote

- **`src/test-setup.ts` mocka `matchMedia`** (default = desktop) e o `vite.config.ts` fixa `TZ: America/Sao_Paulo`. Teste de data e teste de mobile dependem disso; sem o TZ, asserção de hora falha em CI UTC.
- **Mock de mobile vaza**: `vi.spyOn(window,'matchMedia')` restaurado só no fim do corpo do teste não roda quando o teste falha antes — o `afterEach` de `pages/backoffice/Pedidos.test.tsx` tem `vi.restoreAllMocks()` por isso.
- **A CSP é injetada só no build** (`cspOnBuild` no `vite.config.ts`): `img-src 'self' data:` proíbe asset de CDN, ícone tem que ser SVG inline ou arquivo local.
- **`styles.css` tem 3.000+ linhas** atravessando todas as telas; as seções comentadas são o índice de fato. Mapa e armadilhas de layout em `docs/ui.md` — leia antes de posicionar elemento perto de header sticky ou dentro de `.order-card`.
- **`src/backoffice/order-status.ts` não é só do backoffice**: a consulta pública (`pages/ConsultarPedido.tsx`) e Vendas importam o mesmo modelo de status.
- O basename do Router é derivado do pathname (`src/lib/basename.ts`) porque o site vive sob `/manoel-lisboa` no domínio próprio, mas na raiz na origem S3 legada.

## Docs relevantes

`docs/ui.md` · `docs/loja.md` · `docs/pedidos.md` · `docs/livros.md` · `docs/testes.md`
