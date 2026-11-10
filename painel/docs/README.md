# DOC — documentação do SIGA Plus

Site VitePress publicado no Cloudflare Pages (projecto `siga-docs`). Explica o ecossistema:
WEB vende, ADMIN controla, SIGA trabalha, PayFlow cobra, DOC explica.

```sh
npm ci
npm run dev     # http://localhost:5173
npm run build   # .vitepress/dist (falha com ligações mortas)
```

- Configuração, menus e barras laterais: `.vitepress/config.ts`.
- Endereços das outras apps nas páginas: `.vitepress/ecosystem.ts` (variáveis `VITE_*_URL`
  do deploy, as mesmas do menu «Apps»).
- `public/_headers` (cabeçalhos de segurança) e `public/_redirects` (endereços antigos das
  secções do modelo de UI, retiradas a 10/11/2026) são lidos pelo Cloudflare Pages.
- Este README não é publicado (`srcExclude`).
