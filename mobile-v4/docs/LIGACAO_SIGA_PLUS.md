# Ligação segura Mobile V4 ↔ SIGA Plus

> Actualização Work: transporte HTTP e validação implementados, integração institucional ainda desligada. Estado e limites actuais em [RELATORIO_WORK_2026-10-09.md](RELATORIO_WORK_2026-10-09.md); as próximas etapas abaixo descrevem o plano inicial.

Estado: o frontend já suporta activação explícita do adaptador API; **não existe ligação institucional activa no deploy público**. A aplicação publicada permanece demonstração. Não apontar o Mobile V4 directamente para Supabase com chave privilegiada.

## Arquitectura recomendada

1. Autenticar na origem SIGA Plus com a sessão institucional existente (incluindo MFA e vínculos activos).
2. Criar um adaptador autenticado `/api/mobile-v4` na **mesma origem** da aplicação, com `GET /session`, `GET /schools/:id/workspace?role=...`, `POST /schools/:id/commands`, `POST /logout`.
3. Fazer o servidor validar sessão, escola, papel, matrícula/atribuição, RLS, grants, período académico e auditoria em cada operação.
4. Servir o Mobile V4 sob uma rota institucional com proxy same-origin, ou usar um backend-for-frontend com cookies seguros e protecção CSRF. O domínio isolado `pages.dev` não partilha automaticamente os cookies do portal principal.
5. O frontend selecciona `ApiGateway` somente quando `VITE_MOBILE_V4_API_MODE=institutional` está definido no **build**. Não definir essa variável no projecto público Pages até os quatro endpoints estarem implementados, protegidos e testados. A ausência da variável não activa API nem fallback silencioso.
6. Testar professor, aluno, conta sem vínculo, duas escolas, expiração de sessão, notas privadas/publicadas, períodos fechados, mensagens, troca de contexto e revogação.

## Configuração de arranque do frontend

- `VITE_MOBILE_V4_API_MODE=institutional`: activa o `ApiGateway` same-origin (`/api/mobile-v4`). Só usar em ambiente institucional com BFF autenticado, MFA, CSRF e contratos validados.
- Variável ausente ou qualquer outro valor: mantém o fluxo de demonstração explicitamente escolhido pelo utilizador, sem acesso automático a dados reais.
- A variável de build não é um segredo nem um mecanismo de autorização; todas as verificações obrigatórias continuam no servidor.
- Nunca activar o modo institucional no `pages.dev` isolado sem uma origem/BFF autenticada apropriada.

## Refinamento visual

O CSS neutro e acessível foi adicionado à branch isolada. Antes do merge, testar Android Chrome, iOS Safari, desktop, contraste, zoom 200%, teclado e leitor de ecrã. Preservar a identidade SIGA Plus e as páginas já implementadas.

## Publicação

O projecto Cloudflare Pages `siga-plus-mobile-v4` usa Direct Upload. Commits no GitHub não actualizam automaticamente a URL. Gerar `npm ci && npm run typecheck && npm test && npm run build`, publicar o conteúdo de `dist/` e verificar deployment e HTTPS. Não alterar DNS ou a produção `portal-siga.com` durante esta fase.
