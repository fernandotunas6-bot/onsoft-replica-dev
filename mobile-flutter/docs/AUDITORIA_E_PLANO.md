# Expansão institucional SIGA Plus Flutter — 13/10/2026

Auditoria estática da cópia do repositório fernandotunas6-bot/onsoft-replica-dev,
base Mobile V4 0249dab7, com incrementos locais Flutter. Não é auditoria da
produção nem de todas as PRs actuais; schema snapshot não prova RLS instalada.

| Área | Estado do código auditado | Flutter / próximo passo | Evidência |
|---|---|---|---|
| Sessão, escola e papel | Existente | Parcial: email/TOTP e vínculos; sem ensaio real | src/features/mobile-v4/session-core.server.ts, authorization.ts |
| ID/B.I. + senha | Parcial | Bloqueado por contrato móvel, contexto escola e CAPTCHA | src/features/access/bi-login.ts |
| Google OAuth/recuperação | Parcial no ecossistema | Por implementar no Flutter com redirects e captcha compatíveis | src/features/auth/reset-password-server.ts; cliente Supabase |
| Turmas/disciplinas/horários/tarefas | Existente em API | Páginas de consulta implementadas, testes não executados | academic-catalog.server.ts; lib/academic_page.dart |
| Presenças/chamada | Existente em código servidor | Por migrar UI; exige MFA e validação de turmas | attendance.server.ts, attendance-call.server.ts |
| Notas e diários | Existente em API | Por migrar UI, não presumir escala nem publicação | results.server.ts, gradebooks.server.ts |
| Propinas/recibos/Payflow | Existente em API | Por migrar UI; pagamento confirmado pelo provedor | finance.server.ts |
| Chat/Storage/Realtime | Parcial | Flutter só lista conversas; escrita depende de capacidades instaladas | chat.server.ts, chat-commands.server.ts, chat-files.server.ts, browser.ts |
| Avisos | Existente em API | Por migrar UI/paginação/marcação | notifications.server.ts |
| Integrações por escola | Existente no portal | Falta endpoint móvel de capacidades | src/features/integrations/server.ts, install.ts |
| Zoom | Parcial, OAuth/API no servidor | Falta endpoint móvel autorizado; configuração e execução não verificadas | src/features/integrations/zoom.ts; api/integrations/zoom/callback.tsx |
| WhatsApp | Parcial: mensagens/lançadores | Convite da turma requer contrato e link validado; não há prova de grupos automáticos | whatsapp-client.ts, actions.ts |
| Google Calendar | Parcial: subscrição ICS/lançador | Não equivale a sincronização bidireccional via API | integrations/install.ts |
| Gmail/Drive/Classroom/Meet | Por auditar em profundidade | Não considerar integrações operacionais só por existirem no catálogo | integrations/actions.ts; saas/mailbox-google.ts |
| BigBlueButton | Por implementar no código examinado | Conector servidor, endpoint e permissões próprios | pesquisa de BBB/BigBlueButton sem implementação encontrada |
| Transporte/GPS | Por implementar no código examinado | Schema privado, autorização, dispositivos e API | pesquisa em src e snapshot sem módulo operacional encontrado |
| Biblioteca | Por expor ao cliente móvel | Não consta do router HTTP Mobile V4 examinado | src/features/mobile-v4/http.server.ts |
| Flutter build/testes | Bloqueado no executor | SDK ausente; workflow preparado, não executado | .github/workflows/mobile-flutter.yml |
| Publicação | Bloqueada | Envio público rejeitado anteriormente; domínio não alterado | trabalho local; sem push nesta expansão |

“Existente” significa código encontrado; “validado” requer execução e evidência.
Nenhuma integração externa nem funcionalidade Flutter é classificada como
validada nesta auditoria. Não houve consultas a dados pessoais nem migrações.

## Organização e contratos

Rotas entregues: /home, /subjects, /calendar, /messages, /more,
/more/classes, /more/classes/:id, /more/tasks. Todas partilham o gate de sessão,
escola e papel; a lista de turmas deriva de classGroupId no catálogo autorizado.
Participantes não são renderizados por ausência de avaliação de privacidade por
perfil; nenhuma lista de colegas é inferida das permissões académicas.

Novas rotas planeadas (não publicadas): /transport com /vehicles, /drivers,
/routes, /routes/:id, /boarding, /history; /online-lessons; /integrations/google,
/whatsapp; /finance; /library; /results. Não criar atalhos antes de haver serviço.

Manter /api/mobile-v4 existente. Novos endpoints exigem contratos versionados,
schemas, guardas servidor e testes HTTP de origem/sessão/escola/perfil. A
configuração de uma integração não comprova token válido nem acesso ao recurso.
Resposta de capacidades proposta: schoolId, provider, version, status,
grantedCapabilities e capabilities efectivamente suportadas. Nunca devolver
segredos, tokens OAuth, links de anfitrião ou credenciais de BBB ao cliente.

## Transporte

Modelos propostos: vehicle, driver, route, stop, assignment, trip,
position, boardingEvent. Cada registo com school_id; assignment liga matrícula
ou vínculo autorizado, nunca apenas nome/telefone. Acompanhamento filtra viagem
activa e educandos autorizados no servidor. Estado GPS: disabled, awaiting,
live, stale, ended. Mostrar timestamp, precisão e origem do dispositivo; nunca
animar posição inventada como real. Consentimento/registo de acesso, retenção
curta de posições, acesso restrito e ingestão autenticada por dispositivo.
Notificação de embarque não deve ser deduzida de proximidade GPS sem evento.

Uma futura prévia ilustrativa deve estar marcada “Simulação — sem GPS real”.
Não foi criada uma falsa rota institucional nesta entrega. Mapa real depende
de fornecedor, chave, licença, quotas e dispositivos integrados.

## Login institucional

Reutilizar passwordGrant e resolvedores existentes sem enviar e-mail resolvido
para o dispositivo nem permitir enumeração de contas. ID curto requer school
code/tenant inequívoco; associação ao vínculo validada no servidor. Avaliar
ambiguidade do resolvedor actual antes de expor ID/B.I. O código actual indica
CAPTCHA activa: falta integração no Flutter, incluindo renovação e falhas. A
UI email/TOTP desta base não comprova funcionamento em produção. Google OAuth
precisa callback autorizado e recuperação precisa fluxo completo de sessão;
passkeys precisam do domínio original e integração correspondente.

## Sequência de execução

1. Executar analyze/test/build e corrigir antes da release; fixar lockfile.
2. Completar login/CAPTCHA, MFA, sessão e perfis com contas autorizadas.
3. Validar turmas/tarefas de duas escolas; acrescentar páginas de notas/avisos.
4. Migrar chat/histórico/Storage/Realtime, mantendo capacidades server-side.
5. Expor capacidades e links institucionais de aula/WhatsApp com allowlist.
6. Integrar Zoom e Google com credenciais existentes no servidor; BBB novo.
7. Criar transporte, dispositivos e ensaio autorizado sem localização fictícia.
8. Validar Payflow, biblioteca, offline e acessibilidade por perfil.
9. Preparar targets Android/iOS, assinatura, privacy e publicação Web reversível.

Credenciais/quota/custos/licenças de fornecedores não foram verificados.
Consultar documentação oficial actual antes de implementar cada conector;
não aplicar versões presumidas ou reutilizar funcionalidades meramente anunciadas.
