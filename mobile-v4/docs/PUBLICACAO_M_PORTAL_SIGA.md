# Publicação em m.portal-siga.com — decisão de 10/10/2026

Decisão do dono: a app móvel (PWA professor/aluno, provisória para Android e iOS) vive em
**`m.portal-siga.com`**, servida pelo **mesmo Worker do portal**. Substitui o preview
`*.siga-plus-mobile-v4.pages.dev` como endereço de uso.

## Porquê

|                            | pages.dev (antes)                  | m.portal-siga.com (agora)                  |
| -------------------------- | ---------------------------------- | ------------------------------------------ |
| Chave de servidor          | segunda cópia num Worker público   | só no Worker do portal                     |
| Chaves de acesso (passkey) | não funcionam (RP ID errado)       | funcionam (RP ID `portal-siga.com`)        |
| API                        | Worker próprio com o código da API | `/api/mobile-v4/*` do portal, mesma origem |
| Publicação                 | Direct Upload manual               | sai com o deploy do portal (`deploy-cf`)   |
| Sessão                     | login próprio                      | login próprio (origem distinta do portal)  |

A sessão continua separada da do portal: o armazenamento é por origem. É o preço da identidade
própria da app instalada (ícone, nome, ecrã inteiro), separada da PWA do portal.

## Como funciona

1. `npm run mobile:build` (raiz) compila `mobile-v4/portal/` com as dependências da raiz para
   `public/mobile/` (ignorado no git) e gera o service worker só do shell (`scripts/pwa.mjs`).
   `deploy-cf.mjs` corre isto antes do build do portal.
2. Os ficheiros saem nos assets do Worker em `/mobile/`. Manifesto, `scope` e service worker
   ficam em `/mobile/`, sem tocar no `sw.js` do portal.
3. `src/lib/mobile-host.ts` (chamado em `src/server.ts`): no host `m.` só passa
   `/api/mobile-v4/*`; outras APIs e server functions dão 404; páginas do portal e a raiz levam a
   `/mobile/`. A API recusa origens diferentes do próprio host (403).
4. `m` e `mobile` estão em `RESERVED_SUBDOMAINS` (nenhuma escola os tinha; `m` já era curto
   demais para slug).
5. A rota `*.portal-siga.com/*` já leva ao Worker; não há DNS a criar.

Os ficheiros também respondem em `portal-siga.com/mobile/` (os assets são servidos antes do
Worker em qualquer host). É a mesma app; o endereço oficial a divulgar é `m.portal-siga.com`.

## Instalar no telemóvel

- **Android (Chrome):** abrir `https://m.portal-siga.com` → menu ⋮ → «Instalar aplicação».
- **iOS (Safari):** abrir o endereço → Partilhar → «Adicionar ao ecrã principal». Push só em
  iOS 16.4+ e só com a app instalada.
- Lojas, mais tarde: TWA (Bubblewrap) para a Play Store e Capacitor para a App Store embrulham
  este mesmo endereço, sem reescrever a app.

## Por fazer pelo dono

1. Supabase → Authentication → URL Configuration: acrescentar `https://m.portal-siga.com/**`
   às Redirect URLs (links de e-mail, p. ex. recuperar senha).
2. Supabase → Multi-Factor → WebAuthn: confirmar a origem `https://*.portal-siga.com` (já no
   plano do portal), que cobre `m.`.
3. Depois de validar `m.portal-siga.com` com contas reais de professor e aluno: apagar o projecto
   Pages `siga-plus-mobile-v4`, ou pelo menos o segredo de servidor do ambiente preview.

## Ensaio (10/10/2026)

- Build completo do portal + `wrangler dev` local com `Host: m.portal-siga.com`: `/` → 302
  `/mobile/`; `/mobile/`, manifesto e `sw.js` 200; `/api/mobile-v4/session` 401
  `SESSION_REQUIRED`; `/api/saas/tenants/lookup` 404; `/login` → `/mobile/`; o portal em
  `portal-siga.com` continua 200.
- Chromium a 390 px: ecrã de entrada sem erros JS nem overflow horizontal.
- Não ensaiado: login real, MFA real e instalação num dispositivo físico.

## Próximas integrações (ordem decidida)

1. Escritas do professor: chamada e notas por disciplina (comandos com auditoria, idempotência
   por `requestId` e conflito de revisão), reutilizando os serviços do SIGA.
2. Chat real (`chat-server.ts`: `assertMember`, `assertConversationOpen`).
3. Notificações push (reutilizar o push do portal na app `/mobile/`).
4. Tarefas e entregas, com upload de ficheiros.
