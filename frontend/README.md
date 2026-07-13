# frontend — Livraria Local

Vite + React (TS). Loja pública (catálogo `/`, carrinho `/carrinho`, consulta de pedido `/pedido`) e backoffice (`/backoffice/*`) num único SPA, servido de S3 static website. Documentação geral no [README raiz](../README.md); regras de negócio no [CLAUDE.md](../CLAUDE.md).

```sh
npm run dev     # localhost:5173, aponta pra API dev (.env.development)
npm test        # vitest + testing-library (jsdom; TZ fixado America/Sao_Paulo)
npm run check   # tsc -b --noEmit
npm run build -- --mode development|production   # injeta a CSP via <meta> no build
```

Pontos de atenção:

- `VITE_API_KEY` embarcada no bundle **não é segredo** (fricção anti-bot).
- Capas em `public/images/<stage>/<id>.jpg` (comprimir com `scripts/compress-covers.sh`).
- Design tokens em `src/styles.css` (Newsreader + IBM Plex Mono, paleta papel/tinta/vinho); breakpoint mobile do backoffice: 700px.
- Perfis de acesso: `src/backoffice/auth.ts` (`tokenRole`/`canWrite`) — telas escondem escrita para `viewer`/`stock`, mas quem nega é a API.
