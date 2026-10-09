# Ligação segura Mobile V4 ↔ SIGA Plus

Estado: preparação técnica; **não existe ligação institucional activa**. A aplicação publicada permanece demonstração. Não apontar o Mobile V4 directamente para Supabase com chave privilegiada.

## Arquitectura recomendada

1. Autenticar na origem SIGA Plus com a sessão institucional existente (incluindo MFA e vínculos activos).
2. Criar um adaptador autenticado `/api/mobile-v4` na **mesma origem** da aplicação, com `GET /session`, `GET /schools/:id/workspace?role=...`, `POST /schools/:id/commands`, `POST /logout`.
3. Fazer o servidor validar sessão, escola, papel, matrícula/atribuição, RLS, grants, período académico e auditoria em cada operação.
4. Servir o Mobile V4 sob uma rota institucional com proxy same-origin, ou usar um backend-for-frontend com cookies seguros e protecção CSRF. O domínio isolado `pages.dev` não partilha automaticamente os cookies do portal principal.
5. Ligar `ApiGateway` apenas após a implementação e testes reais dos quatro endpoints; não trocar silenciosamente para `DemoGateway` quando a API falhar.
6. Testar professor, aluno, conta sem vínculo, duas escolas, expiração de sessão, notas privadas/publicadas, períodos fechados, mensagens, troca de contexto e revogação.

## Refinamento visual

O CSS neutro e acessível foi adicionado à branch isolada. Antes do merge, testar Android Chrome, iOS Safari, desktop, contraste, zoom 200%, teclado e leitor de ecrã. Preservar a identidade SIGA Plus e as páginas já implementadas.

## Publicação

O projecto Cloudflare Pages `siga-plus-mobile-v4` usa Direct Upload. Commits no GitHub não actualizam automaticamente a URL. Gerar `npm ci && npm run typecheck && npm test && npm run build`, publicar o conteúdo de `dist/` e verificar deployment e HTTPS. Não alterar DNS ou a produção `portal-siga.com` durante esta fase.
