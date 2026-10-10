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

1. ~~Chamada do professor~~ e ~~notas das avaliações~~ — feitas (ver abaixo). Falta: notas por disciplina (MAC/NPP/NPT da pauta) (comandos com auditoria, idempotência
   por `requestId` e conflito de revisão), reutilizando os serviços do SIGA.
2. Chat real (`chat-server.ts`: `assertMember`, `assertConversationOpen`).
3. Notificações push (reutilizar o push do portal na app `/mobile/`).
4. Tarefas e entregas, com upload de ficheiros.

## Chamada do professor (10/10/2026)

- `GET /api/mobile-v4/schools/:id/lessons?role=professor`: aulas de hoje (Luanda) do professor,
  com as sessões de chamada criadas como no portal e as marcações já gravadas.
- Comando `attendance` (`POST …/commands`, exige MFA aal2): grava e fecha a chamada com
  `recordAttendanceCall`, o mesmo núcleo do portal (`features/pedagogica/attendance-core.server.ts`):
  só o professor da aula, só alunos matriculados, recusa se a pauta do período já é oficial,
  recalcula a taxa de presença. Repetir o mesmo envio devolve sucesso sem nova escrita; chamada
  fechada com outros estados → 409, corrige-se no portal com motivo e auditoria.
- A sessão anuncia `attendance.write` ao professor. App: «Chamada de hoje» no ecrã de presenças
  (Todos presentes, Presente/Falta/Justificada por aluno, Fechar chamada).
- Sem migrações: usa as tabelas e funções já existentes.

## Passagem para o Worker do portal (opção 2, decidida a 10/10/2026)

O dono escolheu servir `m.portal-siga.com` pelo Worker do portal
(`fernandotunas6-bot-onsoft-replica-dev`). Até à passagem, o Worker de domínio
`siga-plus-mobile-v4-domain` (rota específica + Custom Domain) continua a servir `m.`, e o
encaminhamento em `src/lib/mobile-host.ts` não recebe pedidos. A ordem importa: remover a rota
antes do deploy deixaria `m.` no portal antigo, que trata `m` como escola.

1. **Merge e deploy do portal** com este código (`deploy-cf.mjs` compila `public/mobile/`).
2. **Ensaio sem mexer no domínio** — o Worker do portal já responde a `m.` quando o pedido
   lhe chega; confirmar no `workers.dev`/preview do portal com o cabeçalho Host:
   `curl -sI -H "Host: m.portal-siga.com" <url do portal>/` → `302 Location: /mobile/`;
   `…/mobile/manifest.webmanifest` → 200; `…/api/mobile-v4/session` → 401.
3. **Passagem (painel Cloudflare, zona portal-siga.com):**
   - Workers & Pages → `siga-plus-mobile-v4-domain` → Settings → Domains & Routes: remover o
     Custom Domain `m.portal-siga.com` e a rota `m.portal-siga.com/*`.
   - DNS: confirmar que `m` fica coberto pelo registo wildcard `*` do portal (se a remoção do
     Custom Domain apagar um registo `m` próprio, o wildcard passa a responder).
4. **Verificar em produção:** `https://m.portal-siga.com/` → `/mobile/`; entrar com uma conta de
   professor e uma de aluno; `…/api/saas/tenants/lookup` → 404.
5. **Limpeza (depois de validado):** apagar o Worker `siga-plus-mobile-v4-domain` e o projecto
   Pages `siga-plus-mobile-v4` (ou pelo menos o segredo de servidor do ambiente preview).

**Reversão:** voltar a adicionar a rota `m.portal-siga.com/*` e o Custom Domain ao Worker
`siga-plus-mobile-v4-domain` (configuração em `mobile-v4/deployment/wrangler.jsonc`). O portal
não precisa de ser revertido: sem pedidos para `m.`, o código fica inactivo.

A sessão de agente não tem ferramentas Cloudflare de escrita (só leitura); os passos 3 e 5 são do
dono no painel.

## Notas das avaliações (10/10/2026)

- `GET /api/mobile-v4/schools/:id/assessments?role=professor`: avaliações (`siga_assessment_items`)
  dos pares turma × disciplina atribuídos ao professor, com as notas e a versão (`updated_at`).
- Comando `scores` (aal2): `recordAssessmentScores`, o núcleo do portal
  (`features/academic/assessment-scores-core.server.ts`): cotação, trimestre fechado, pauta
  oficial, só alunos da turma, auditoria `grades.assessment_score_changed`. O mobile acrescenta:
  professor atribuído à turma × disciplina (403) e versão vista por nota — nota mudada entretanto
  → 409, nada é gravado.
- A sessão anuncia `grades.write` ao professor. App: «Lançar notas» na página Notas (só as notas
  mudadas são enviadas; vírgula aceite; acima da cotação bloqueado no campo).
- Criar avaliações e as notas de pauta (MAC/NPP/NPT) continuam no portal. Sem migrações.
