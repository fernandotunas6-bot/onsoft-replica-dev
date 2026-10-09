# Cloudflare Pages — Mobile V4 (pré-visualização isolada)

Esta publicação contém **somente** os ficheiros compilados de `mobile-v4/`. Não é a produção institucional do SIGA Plus.

## Actualização Work — preview de staging

- Publicação isolada: https://04e9ebe7.siga-plus-mobile-v4.pages.dev.
- Alias: https://staging-mobile-v4-pr116.siga-plus-mobile-v4.pages.dev.
- Deployment: `04e9ebe7-ac37-43ff-8380-3fe0037ba095`, ambiente **preview**, estado `success`, 9/10/2026 às 18:23:40 UTC.
- Commit publicado: `9113462d375e25b6d2080cf4c413167d0dc6bd47`.
- [Workflow Mobile aprovado](https://github.com/fernandotunas6-bot/onsoft-replica-dev/actions/runs/37972841739) e [CI raiz aprovado](https://github.com/fernandotunas6-bot/onsoft-replica-dev/actions/runs/37972841534) para esse commit.
- Home, manifesto e service worker devolveram 200; sete assets públicos correspondem byte a byte ao build local. Sessão e logout devolveram 503 JSON com `INSTITUTIONAL_API_DISABLED`.
- Chromium a 390/768/1280 px: navegação, selector de escola sem sessão, menu, Segurança e reload por hash aprovados; sem erros JavaScript ou overflow horizontal. Ensaio anónimo, sem percursos institucionais reais.
- O agente HTTP Python foi inicialmente bloqueado pelo Cloudflare com 403/1010. A verificação com User-Agent de navegador e a abertura em Chromium funcionaram. Nenhuma regra Cloudflare foi alterada.
- O URL canónico do projecto permanece na publicação anterior (`https://17570c06.siga-plus-mobile-v4.pages.dev`). Apenas a branch `staging-mobile-v4-pr116` foi publicada; `portal-siga.com` não foi alterado.

O preview contém a interface existente, com API institucional explicitamente desligada. Não é deploy do backend autenticado nem validação de contas e dados reais. Relatório: [RELATORIO_WORK_2026-10-09.md](RELATORIO_WORK_2026-10-09.md).

## Histórico anterior — 9 de Outubro de 2026

- Projecto Cloudflare Pages: `siga-plus-mobile-v4`.
- Endereço: https://siga-plus-mobile-v4.pages.dev.
- Modo de publicação: **Direct Upload**, não integração Git automática.
- Último deploy confirmado: `3771ab43-20f5-44ea-81de-5b8ddfe87c08` (9/10/2026, 16:56 UTC).
- O workflow `Mobile V4 — validate and package preview` passou no commit `64433066ef6a088e0981fe2046fad6f3d340282f`; gerou o artefacto `siga-mobile-v4-preview`.
- **O artefacto aprovado não foi publicado automaticamente.** O endereço Pages continua a servir a versão do último deploy confirmado, até uma nova publicação explícita.

## Processo correcto para publicar uma nova versão

1. Confirmar o SHA da branch `feat/siga-plus-mobile-v4-isolated` e verificar que o workflow Mobile V4 está integralmente aprovado **para esse SHA**.
2. No workflow aprovado, descarregar o artefacto `siga-mobile-v4-preview`. Descompactar o ZIP: o conteúdo compilado (incluindo `index.html`) é o que deve ser publicado, não o código-fonte nem o próprio ZIP como ficheiro do site.
3. No Cloudflare Dashboard, abrir **Workers & Pages → siga-plus-mobile-v4 → Deployments → Create deployment** e enviar o directório compilado ou usar Wrangler Pages deploy autenticado, conforme disponível.
4. Publicar **apenas** em `siga-plus-mobile-v4`; não alterar `portal-siga.com`, DNS ou outros projectos.
5. Confirmar o estado `success`, o novo deployment ID, a hora e o URL de preview. Comparar com o deploy anterior antes de afirmar que a versão nova está online.
6. Fazer smoke tests: abrir a home, navegar entre as páginas, seleccionar a escola, verificar os caminhos dos assets, recarregar uma rota, instalar a PWA e verificar o comportamento offline.
7. Se a validação falhar, reverter para um deployment anteriormente aprovado utilizando os controlos próprios do Cloudflare Pages. Não efectuar merge na aplicação principal como forma de corrigir o preview.

**Importante:** a actual instância Pages é Direct Upload. Alterar commits no GitHub **não desencadeia** publicação automática. Para CI/CD futuro, avaliar um workflow com permissões mínimas e token Cloudflare limitado ao projecto; nunca adicionar tokens ao código, a ficheiros públicos ou a variáveis `VITE_*`.

## Segurança e integração

- A URL `pages.dev` é pública excepto se o projecto estiver protegido por Cloudflare Access; tratar a versão como demonstração, sem dados pessoais reais.
- Nunca colocar chaves `service_role`, segredos Supabase, tokens JWT ou credenciais institucionais na PWA, nos assets ou no ZIP de publicação.
- Não activar a API institucional até existir backend autenticado, isolamento por escola e testes de permissões, sessão, MFA e protecção CSRF.
- Em particular, o subdomínio `pages.dev` **não partilha automaticamente** cookies institucionais com `portal-siga.com`. A ligação real exige arquitectura BFF/origem aprovada, não uma simples mudança de URL no frontend.
- Validar Android/iOS, teclado virtual, zoom, contraste, navegação, instalação PWA e armazenamento antes da promoção.
