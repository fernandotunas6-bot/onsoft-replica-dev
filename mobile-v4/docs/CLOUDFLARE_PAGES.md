# Publicação Mobile V4 — Cloudflare

## Endereço público

- Mobile: https://m.portal-siga.com.
- Conteúdo fixado no deployment de testes conectado https://361b8072.siga-plus-mobile-v4.pages.dev.
- Aplicação: commit `586d9a268d7b799c61c100d73c2e5fbc57768d41`, deployment `361b8072-e50d-4d6b-ad7a-eefd58168b40`, preview concluído em 10/10/2026 às 12:04:52 UTC.
- O domínio foi publicado a pedido do utilizador. A aplicação continua em validação institucional: não afirmar que todos os percursos reais foram aprovados.

## Roteamento isolado

O Worker `siga-plus-mobile-v4-domain` encaminha apenas o Mobile para um deployment Pages **fixo**, sem alterar o Worker principal nem o deployment canónico antigo do projecto Pages. O alias de staging não é usado como destino, evitando que um novo preview altere automaticamente o domínio público.

Configuração versionada: `mobile-v4/deployment/wrangler.jsonc`; módulo `domain-worker.mjs`. `PUBLIC_ORIGIN` e `PAGES_ORIGIN` são configurações públicas de servidor, sem chaves Supabase. Os segredos existentes continuam nos bindings do preview Pages.

- Custom Domain: `m.portal-siga.com`, ID `4cef2b320a8b89f8f1ac16579462075a3ef25e81`.
- Rota específica: `m.portal-siga.com/*` → `siga-plus-mobile-v4-domain`, ID `a570bd8602ef4386afb715a11ae7ec74`. Necessária porque existe uma rota wildcard do portal principal.
- Zona: `a817debe40353d51e056c77e18e57f19`; conta: `701800d01d428c5141fa1fdb60ee01ae`.
- Os hostnames do portal, PayFlow, escolas, ADMIN, WEB e DOC permanecem nas configurações anteriores.

A API rejeita Origin externo/cross-site **antes** de encaminhar. Só a origem pública validada é traduzida para a origem Pages, conservando a verificação do backend. Authorization mantém-se; cookies do domínio pai e cabeçalhos de proxy são removidos. Respostas privadas/no-store e noindex; corpos em streaming; redirects externos recusados, internos reescritos para o Mobile. Falhas devolvem 502, sem fallback para o portal ou dados fictícios.

## Actualização e reversão

1. Executar testes, tipos, lint e builds da branch; confirmar os workflows do SHA.
2. Publicar `dist-connected` como **preview** no projecto `siga-plus-mobile-v4`, com a branch `staging-mobile-v4-pr116`; nunca publicar o `dist` demo como aplicação conectada.
3. Validar o novo URL fixo: assets, autenticação negativa, métodos/origens, interface e percursos autorizados de professor/aluno.
4. Actualizar exclusivamente `PAGES_ORIGIN` no Worker do Mobile para o deployment aprovado, registar SHA/ID e testar novamente `m.portal-siga.com`.
5. Reversão de conteúdo: repor o URL fixo anterior em `PAGES_ORIGIN`. Para remover o domínio Mobile: remover somente a sua rota específica e Custom Domain. Isto devolve o hostname ao comportamento wildcard anterior; não alterar o wildcard nem o portal principal.

O projecto Pages é Direct Upload; commits Git não publicam automaticamente. O teste das protecções do domínio executa-se com `npm run test:domain --prefix mobile-v4` e no workflow Mobile. Não há tokens Cloudflare em código ou variáveis VITE.

## Limites

O novo hostname não partilha automaticamente a sessão do portal: iniciar sessão com a conta Sga existente; TOTP existente é preservado. WebAuthn, restauração de sessão e contas reais continuam por validar no novo hostname. Não alterar a configuração Supabase de produção para contornar esta limitação.

As escritas que dependem da migração proposta de chat continuam desactivadas. Não foi aplicada SQL de produção nem activado globalmente o modo institucional. Uploads, notificações, escritas académicas e pagamentos reais permanecem pendentes conforme o [relatório funcional](RELATORIO_FUNCOES_2026-10-10.md).

A versão conectada mantém noindex/no-store e não instala service worker offline; a PWA demo é um artefacto distinto. Não declarar validação offline ou instalação desta publicação conectada.

## Verificação da publicação em 10/10/2026

- HTTPS 200 e quatro assets comparados byte a byte com `dist-connected`.
- Dez endpoints de consulta: sessão ausente e bearer inválido devolveram 401; respostas private/no-store. Notificações também recusaram Origin local sem sessão com 401.
- Origem externa, origem do portal pai e `null` devolveram 403; método incorrecto devolveu 405.
- Chromium: entrada/reload a 390/768/1280 px, sem erros JS nem overflow. Respostas HTTP reais encaminhadas por Node, sem dados simulados; não é um ensaio positivo de credenciais.
- 196 testes Mobile aprovados; teste adicional Node das protecções do domínio aprovado; tipos, lint e formatação aprovados.
- Portal principal: HTTP 200; HTML idêntico após normalizar apenas os timestamps SSR. Rotas existentes preservadas, acrescendo somente a rota Mobile. Deployment canónico Pages antigo permanece `17570c06-7e08-44d9-a05d-1bfc04011dfe`.

## Promoção dos Avisos pessoais

Preview `361b8072` (SHA `586d9a26`) e domínio final verificados: quatro assets byte a byte, notificações com sessão ausente/token inválido 401, origem externa 403, POST 405 e private/no-store. O workflow Mobile e a CI geral do SHA da aplicação passaram.

O Worker do domínio mantém o mesmo código; apenas `PAGES_ORIGIN` mudou para o preview validado. Custom Domain/rota Mobile e todas as rotas do ecossistema preservadas. Reversão: repor `https://c734a903.siga-plus-mobile-v4.pages.dev` na variável `PAGES_ORIGIN` do Worker Mobile. Não reverter por merge no portal nem por alteração de DNS wildcard.

Avisos consultam dados próprios por utilizador/escola; sem marcar como lido ou activar push. A estrutura real da tabela foi confirmada por SELECT de metadados no Sga. Sem escritas/migrações na produção. Testes positivos com contas reais continuam pendentes. Relatório: `RELATORIO_AVISOS_2026-10-10.md`.
