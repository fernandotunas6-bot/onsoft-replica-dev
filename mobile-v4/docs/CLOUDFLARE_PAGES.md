# Cloudflare Pages — Mobile V4 (preview isolado)

Este projecto publica somente o conteúdo compilado de `mobile-v4/`, nunca a aplicação principal do SIGA Plus.

## Criar no Cloudflare Dashboard

1. Workers & Pages → Create → Pages → Connect to Git.
2. Seleccionar `fernandotunas6-bot/onsoft-replica-dev`.
3. Project name: `siga-plus-mobile-v4` (se disponível).
4. Production branch: `feat/siga-plus-mobile-v4-isolated` (a publicação inicial é uma DEMO, não a produção institucional).
5. Root directory: `mobile-v4`.
6. Build command: `npm run build`.
7. Build output directory: `dist`.
8. Environment variable: `NODE_VERSION=24`.
9. Guardar e executar o primeiro deploy. Confirmar o endereço \*.pages.dev atribuído pelo Cloudflare.

## Segurança

- Esta publicação é acessível publicamente por URL, salvo configuração de Cloudflare Access. Não usar dados reais de alunos, professores ou mensagens.
- Não configurar credenciais de serviço do Supabase no frontend, nem introduzir segredos em variáveis VITE\_\*.
- Não ligar API institucional, autenticação real ou domínio principal nesta fase.
- Para restringir a demonstração, configurar Cloudflare Zero Trust Access para o hostname atribuído.
- Validar instalação PWA em Android/iOS, cache, teclado, responsividade, contraste e navegação antes de promover.
- Se a branch de demonstração evoluir, rever a estratégia de branch de produção Pages antes de integrar a PR #116.
