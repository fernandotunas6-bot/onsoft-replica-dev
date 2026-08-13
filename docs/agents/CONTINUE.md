# Handoff — continuar o SIGA

Ler isto **antes** de alterar código. Depois abrir o skill do módulo em `.cursor/skills/`.

## Estado (2026-08-13)

Os ciclos 1–34 da sessão premium estão no código. As consolidações mais recentes
estão versionadas localmente:

- `6d11ee8` — módulos escolares e tesouraria
- `251ef86` — contratos tipados dos módulos
- `afd58b8` — requisitos dos validadores visuais na CI
- `ac2aba5` — fotos de pessoas protegidas no Storage
- `1eea631` — avatares de conta privados com URLs assinadas
- `f6bb092` — limpeza de avatares privados substituídos

| Ciclo | O quê                                                                                     | Estado                          |
| ----- | ----------------------------------------------------------------------------------------- | ------------------------------- |
| 1     | Filtros persistentes URL + localStorage                                                   | Feito                           |
| 2     | Folha sequencial de aluno + link público `/matricula/$slug`                               | Feito (precisa SQL)             |
| 3     | Folha de turmas + WhatsApp                                                                | Feito (colunas WhatsApp no SQL) |
| 4     | Grants, ficha professor, workspace, ICS                                                   | Feito (tabelas no SQL)          |
| 5     | Pagamento avançado Multicaixa/Unitel                                                      | Feito (tabela no SQL)           |
| 6     | Catálogo integrações + 2FA TOTP                                                           | Feito (tabela + AuthGate)       |
| 7     | Wiring catalog-ready nos ecrãs + testes integrações                                       | Feito                           |
| 8     | Supervisão de desempenho + resposta ao toque                                              | Feito                           |
| 9     | Identidade Angola (BI/NIF/IBAN), perfil, branding, AGT                                    | Feito (precisa SQL)             |
| 9     | Lazy Recharts + impressão diferida (print-issue-loader)                                   | Feito                           |
| 10    | Telefone angolano (+244): componente, validação Zod, normalização E.164                   | Feito                           |
| 11    | Mensagens internas no painel da conta (colegas reais, pesquisa, thread)                   | Feito (precisa SQL)             |
| 12    | Não-lidas: ponto nos avatares, sino e lista de notificações                               | Feito                           |
| 13    | Sino operacional: candidaturas, matrícula, documentos, faturas                            | Feito                           |
| 14    | Taxa de presença na matrícula, ficha, dashboard e turmas                                  | Feito (precisa SQL)             |
| 15    | Destaques no painel da conta (notas, novidades, atalhos)                                  | Feito                           |
| 16    | Gerir destaques em Definições (textos, ordem, visibilidade)                               | Feito                           |
| 17    | Notas e atalhos próprios da escola nos destaques                                          | Feito                           |
| 18    | Público, calendário (Luanda) e pré-visualização dos destaques                             | Feito                           |
| 19    | Destaques no início (além do painel da conta)                                             | Feito                           |
| 20    | Ligação interna ou externa no botão de cada destaque                                      | Feito                           |
| 21    | Ícone, cor e tipo em todos os destaques                                                   | Feito                           |
| 22    | Arquivos (biblioteca Moodle: SGA + local, waffle, picker)                                 | Feito (precisa SQL)             |
| 23    | Arquivos: miniaturas, filtros, logo/perfil da biblioteca                                  | Feito                           |
| 24    | Arquivos ligados a foto aluno/pessoa, docs e comunicados                                  | Feito (precisa SQL)             |
| 25    | Materiais de turma + descarregar/renomear arquivos                                        | Feito (precisa SQL)             |
| 26    | Filtro turma nos arquivos + materiais no workspace                                        | Feito                           |
| 27    | Arquivos visual OneDrive + utilizador, acesso e auditoria                                 | Feito (precisa SQL)             |
| 28    | Arquivos: breadcrumb, barra de comandos, drag-drop, avatares                              | Feito                           |
| 29    | Inquérito de metadados + ligação a utilizadores/pessoas                                   | Feito (precisa SQL)             |
| 30    | Foto de aluno: relação + perfil na ficha                                                  | Feito                           |
| 31    | Media reconhecida + inquérito/área obrigatórios                                           | Feito                           |
| 32    | Pastas, selecção, mover e modal expansível                                                | Feito (precisa SQL)             |
| 33    | Recibos/talões na biblioteca + ID pesquisável                                             | Feito (precisa SQL)             |
| 34    | Planos de Aula (título/conteúdo/anexo + avaliações/provas por turma-disciplina-trimestre) | Feito (precisa SQL)             |
| 35    | Anexo de arquivo nas mensagens internas + conversas enviadas sem resposta a aparecerem na lista + página `/perfil` dedicada | Feito (precisa SQL) |

## Ciclo 9 — identidade, escola e tesouraria

- `src/lib/angola-identity.ts`, `angola-banking.ts`, `angola-phone.ts` — validação BI/NIF, IBAN AO, telefone.
- `src/lib/finance-print.ts` — `buildFinancePrintSchool`, secção **Dados de pagamento** nos PDFs de tesouraria.
- Definições → **Escola**: NIF AGT, logótipo (URL + upload `school-logos`), link Portal AGT.
- Definições → **Financeiro**: IBAN, SWIFT, Multicaixa merchant; **AGT**: série e notas fiscais (metadata, sem SAFT real).
- Definições → **Conta**: telemóvel editável (`profiles.phone` no SQL).
- `AngolaIdentityField` em nova/editar pessoa, matrícula interna e formulário público `/matricula/$slug`.
- `AngolaPhoneField` em nova/editar pessoa, `StudentEnrollmentSheet`, `/matricula/$slug` e `SettingsCenter`.
- Normalização E.164 (`+244 9XX XXX XXX`) antes de persistir em `people.phone` e `profiles.phone`.
- Validação Zod em `personCoreFieldsSchema` para `phone_primary`/`phone_alternative`.
- Recibos/faturas/relatórios financeiros incluem IBAN e logótipo quando configurados.

## SQL no SGA (`xodgfmxiaunpamctfeea`)

Correr **só** no SQL Editor, nesta ordem:

1. `supabase/APPLY_IN_SQL_EDITOR.sql`
2. `supabase/APPLY_ENROLLMENT_AND_PREMIUM.sql`

O segundo cria `current_school_id()` a partir de `school_memberships`. Sem isto as tabelas novas não existem (inclui `siga_assessment_items/scores` do Centro de Avaliação e `siga_lesson_plans/siga_lesson_plan_components` dos Planos de Aula).

### Reaplicação obrigatória de Storage

Após os commits de privacidade, reaplicar os dois scripts canónicos para manter
as políticas alinhadas ao código:

- `school-logos` público fica reservado ao logótipo institucional e ao padrão
  de caminhos gerado pela interface;
- fotos de pessoas ficam no bucket privado `siga-files`, referenciadas por
  `siga-file://` e servidas por URL assinada;
- avatares de conta ficam no bucket privado `avatars`, referenciados por
  `siga-avatar://` e servidos por URL assinada.

Referências públicas legadas de avatar continuam compatíveis enquanto existirem
registos antigos em `profiles.avatar_url`.

**Nunca** aplicar ao SGA:

- `all_migrations_combined.sql`
- `supabase/pending_feature_migrations.sql`
- `supabase/migrations/20260810122022_foundation_schema.sql`
- migrações `2026081114*` isoladas (usam helpers Lovable)

Ver `supabase/DO_NOT_APPLY_TO_SGA.txt`.

## Regras de implementação

1. **Estender, não reescrever** páginas/schemas/server existentes.
2. Padrão de módulo: `src/features/<mod>/schemas.ts` + `server.ts` (`createServerFn` + Zod) + rota em `src/routes/` + teste em `tests/<mod>/`.
3. Listas premium: `usePersistedListFilters` + `ListFilterBar`. Search extra via `.passthrough()` e param `lf`.
4. Escrita SGA: `loadSgaAdminClient` + `requireSgaWriter`. Tabelas SGA muitas vezes **sem** GRANT/RLS para `authenticated`.
5. Rotas públicas: `isPublicAppPath` em `src/lib/public-paths.ts` (hoje `/matricula`, `/calendario/ics`).
6. Node **24** neste macOS. v26 falha (`dyld libc++`).
7. Não commitar `.env`. Não force-push / rebase de histórico já publicado (Lovable).
8. Tabelas em falta: falhar com mensagem para `APPLY_ENROLLMENT_AND_PREMIUM.sql`, ou degradar (como planos de pagamento / WhatsApp).

## Auto-construção

```sh
npm run siga:check          # inventário dos módulos
npm run siga:sql            # lembra o SQL a aplicar
npm run siga:scaffold -- <id> [--route /caminho] [--with-page]
npm run siga:clean-cache   # cache Vite/Nitro se o dev ficar lento
npm test                    # vitest (usar Node 24)
```

Scaffold cria `schemas.ts`, `server.ts`, teste e opcionalmente a rota. Não sobrescreve ficheiros existentes.

Validação local mais recente: `npm run siga:check`, testes Vitest (222), build
de produção e TypeScript concluídos. Os testes SQL pgTAP exigem Docker local;
quando o daemon estiver disponível, correr as suites em `supabase/tests/`.

## Skills (um por módulo)

| Skill               | Quando                                                           |
| ------------------- | ---------------------------------------------------------------- |
| `siga`              | qualquer trabalho SIGA, scaffold, SQL, handoff                   |
| `siga-alunos`       | alunos, matrícula interna, ficha                                 |
| `siga-pessoas`      | pessoas, professores                                             |
| `siga-pedagogica`   | turmas, notas, horários, WhatsApp                                |
| `siga-financeiro`   | caixa, faturas, planos, Multicaixa/Unitel                        |
| `siga-documentos`   | emissão de documentos                                            |
| `siga-calendario`   | calendário lectivo, ICS                                          |
| `siga-comunicacoes` | comunicados                                                      |
| `siga-acessos`      | contas, grants, 2FA                                              |
| `siga-matricula`    | link público `/matricula`                                        |
| `siga-integracoes`  | catálogo catalog-ready                                           |
| `siga-arquivos`     | biblioteca de ficheiros, picker Moodle                           |
| `siga-dashboard`    | dashboard e workspace do professor                               |
| `siga-lesson-plans` | planos de aula, avaliações/provas por turma-disciplina-trimestre |

Registo canónico: `scripts/siga/modules.json`.

## Ciclo 11 — mensagens internas

- Painel da conta: avatares dos colegas da escola (até 7 recentes) e `+` para pesquisar nome/cargo.
- Conversa no mesmo sheet; botão **Sair** só no menu.
- `src/features/messages/` — `listSchoolColleagues`, `listDirectThread`, `sendDirectMessage`.
- Tabela `siga_direct_messages` em `APPLY_ENROLLMENT_AND_PREMIUM.sql`. Sem tabela, as mensagens ficam neste dispositivo.
- Com SGA, a conversa actualiza a cada 8 segundos.

## Ciclo 12 — não-lidas

- Ponto vermelho nos avatares do painel da conta e no `+` se houver conversas fora dos recentes.
- Contador no avatar do cabeçalho e ponto no sino.
- Notificações listam mensagens por ler; clicar abre a conversa no painel da conta.
- Leitura marcada neste dispositivo (`siga:dm-read`); inbox SGA via `listInboxPreviews`.

## Ciclo 13 — avisos do sino

- `listSchoolAlerts` junta candidaturas `pending`, alunos `applicant`, pedidos de documento em curso e faturas vencidas.
- O sino mostra estes avisos (com atalho para a página certa) e as mensagens por ler.
- Textos em `src/features/dashboard/alerts.ts`.

## Ciclo 14 — presença

- `enrollments.attendance_rate` lido na ficha do aluno; Admin/Secretaria **Registar** (0–100).
- Dashboard `attendanceAverage` e turmas pedagógicas usam a média das matrículas activas.
- Boletim inclui a percentagem. Coluna em `APPLY_IN_SQL_EDITOR.sql`.

## Ciclo 15 — destaques da conta

- Catálogo editável em `src/features/spotlight/catalog.ts` (notas, novidades, funções, promoções).
- O cartão «Relatórios avançados» mantém o visual original; os outros usam o mesmo molde com tons e ícones diferentes.
- Ligações internas, externas (Portal AGT) e painéis de Definições. Filtra por cargo.

## Ciclo 16 — gerir destaques

- Definições → **Destaques**: Administrador liga/desliga, reordena e edita título/texto/botão. Ligações ficam no catálogo.
- Persistência em `school_settings.domain = "spotlight"` (JSON; sem DDL novo). Sem linha, usa o catálogo.
- O rail do painel da conta lê `listSpotlightConfig` e continua a filtrar por cargo/`canAccessPath`.
- Atalho: `/configuracoes?painel=destaques`.

## Ciclo 17 — destaques da escola

- **Novo destaque** cria uma nota/novidade/atalho da escola (até 12), com ícone, cor e ligação (página SIGA, painel de Definições ou URL).
- Cartões do catálogo não se apagam; os da escola têm lixo. Atalhos internos respeitam `canAccessPath`.
- `extras` no mesmo JSON `school_settings` domínio `spotlight`. Overrides antigos sem `extras` continuam válidos.

## Ciclo 18 — público e calendário dos destaques

- Cada cartão tem **Quem vê** (cargos) e datas de início/fim no fuso de Luanda. Sem datas, fica sempre visível; sem cargos, todos vêem.
- O painel da conta esconde o que ainda não começou ou já terminou. Pré-visualização do cartão em Definições → Destaques.

## Ciclo 19 — destaques no início

- Notas, novidades e promoções aparecem no dashboard (`/`). Atalhos (`function`, p.ex. Relatórios avançados) ficam só no painel da conta, salvo se o Administrador ligar **Início**.
- Definições → Destaques → **Onde aparece**: Painel da conta e/ou Início. É obrigatório pelo menos um.

## Ciclo 20 — ligação do botão

- Cada destaque tem **Ligação do botão**: página do SIGA (lista ou caminho `/…`), URL externo, ou painel de Definições. Vale para o catálogo e para as notas da escola.
- Caminhos internos ganham `/` se faltar; URLs sem `https://` são completados ao sair do campo. Página interna actualiza o filtro de acesso.

## Ciclo 21 — aspecto dos cartões

- Ícone (grelha), cor e tipo em **todos** os destaques, não só nas notas da escola. Mais ícones (livro, pessoas, estrela, sino, e-mail…).
- Mudar o tipo de atalho para nota/novidade passa a poder aparecer no início, salvo se **Onde aparece** já estiver definido à mão.

## Ciclo 22 — arquivos

- Biblioteca estilo Moodle em `/arquivos` (waffle **Arquivos**, não na sidebar). Áreas: escola, secretaria (reservada), pessoal, públicos.
- Picker modal `FilePickerModal` / botão **Arquivo** em documentos, alunos, comunicações e pedagógica. Painel da conta: **Os meus arquivos**. Definições → Arquivos (área e visibilidade neste dispositivo).
- Bytes no bucket privado `siga-files`; metadados em `siga_files`. Sem SQL: IndexedDB local (ano/mês/área). Máx. 8 MB; só PDF/Word/Excel/PNG/JPEG. A lista não descarrega o ficheiro.
- Sem chave de armazenamento gratuita partilhada. OneDrive = Microsoft 365 catalog-ready (`m365.onedrive` abre `/arquivos`).

## Ciclo 23 — arquivos (miniaturas e ligação)

- Capas PNG/JPEG com pré-visualização a pedido (`FileCoverTile` + `resolveFileUrl`); PDF/Word/Excel mantêm ícone.
- Filtros por tipo (Todos / PDF / Word / Excel / PNG / JPEG) no browser; o picker pode restringir tipos (`acceptKinds`).
- **Da biblioteca** no perfil (foto) e em Definições → Escola (logótipo), só PNG/JPEG.
- Pré-busca de metadados ao apontar para `/arquivos`.

## Ciclo 24 — arquivos nas fichas

- Ficha do aluno e registo central: **Foto** / **Foto da biblioteca** (PNG/JPEG
  → `siga-files` privado + referência `siga-file://` em `people.photo_url`).
- Documento da pessoa: **Anexar PDF** da biblioteca (`file_id` / `file_name` em `person_documents`); botão **Abrir** no anexo. Colunas no `APPLY_ENROLLMENT_AND_PREMIUM.sql`.
- Comunicados: **Anexar arquivo** acrescenta referência `[Arquivo SIGA] nome` à mensagem (sem blob no Postgres).

## Ciclo 25 — materiais de turma

- `siga_files.class_group_id` + índice; listagem/registo/ligação no servidor (fallback se a coluna ainda não existir).
- Cartão da turma em `/pedagogica`: painel **Materiais** (`ClassMaterialsPanel`) — anexar da biblioteca, abrir, descarregar, desligar.
- Browser: **Renomear** e **Descarregar**; metadados locais com `patchLocalFileMeta`.
- Professores anexam via permissão do módulo `arquivos`.

## Ciclo 26 — filtro turma e workspace

- `/arquivos?turma=` filtra a biblioteca; dropdown de turmas no `FileBrowser` (`listArquivosClassOptions`).
- Carregar com filtro activo liga o ficheiro à turma.
- Workspace do professor: painel **Materiais das turmas** (`TeacherClassMaterialsBlock`) + atalho Biblioteca.
- Partilha: copiar `[Arquivo SIGA] …` e WhatsApp (se `whatsapp.class_groups`).

## Ciclo 27 — visual OneDrive, acesso e auditoria

- Browser opaco estilo OneDrive: cabeçalho com **utilizador activo** (avatar + cargo), vista **lista/grelha**, organizar, painel **Detalhes**.
- Colunas: Nome, Modificado, Modificado por, Tamanho, **Acesso** (Privado/Escola/Público), **Actividade**.
- Nível do utilizador no ficheiro: Proprietário / Pode editar / Só leitura; alterar visibilidade no painel Detalhes.
- Auditoria: tabela `siga_file_events` + campos `updated_*` / `last_action_*` em `siga_files` (SQL premium). Abrir/descarregar/renomear/ligar registam eventos.

## Ciclo 28 — refino OneDrive

- Breadcrumb `utilizador › área › turma`; barra de comandos ao seleccionar (Descarregar, Copiar, Renomear, Apagar).
- Drag-and-drop para carregar; Enter abre / Esc limpa; ícones com selo de partilha; avatares em Modificado por / Actividade / auditoria.
- Detalhes: pré-visualização de imagem; picker modal alinhado ao novo visual.

## Ciclo 29 — inquérito de metadados

- Ao carregar (botão ou drag-drop): modal **Inquérito do documento** (`FileUploadInquiryModal`) com título, categoria, data, referência, descrição, acesso, utilizador SIGA e pessoa do registo.
- Colunas SGA: `title`, `description`, `category`, `document_date`, `reference_code`, `related_user_id`, `related_person_id`.
- Filtros por categoria e utilizador relacionado; painel Detalhes mostra e edita metadados; evento `metadata_updated`.

## Ciclo 30 — fotografia de aluno

- Categoria **Fotografia**: inquérito exige aluno (`listArquivosStudentOptions`); PNG/JPEG; opção **Usar como foto de perfil** (predefinida).
- Após guardar: `applyLibraryPhotoToPerson` mantém o ficheiro em `siga-files`
  privado, grava `people.photo_url` como `siga-file://` e actualiza os
  metadados `category=foto` / `related_person_id`.
- Ficha do aluno: painel **Arquivos do aluno** (`StudentRelatedFilesPanel`) com lista ligada, **Usar no perfil** e atalho `/arquivos?pessoa=`.
- Botão **Foto** na ficha também marca o ficheiro como fotografia relacionada.

## Ciclo 31 — media padronizada

- Formatos reconhecidos: PDF, Word, Excel, PowerPoint, CSV, PNG, JPEG, WebP, GIF, SVG (ícones) — ícones por tipo em `FileKindIcon` / `FileCover`.
- Inquérito: **descrição obrigatória** (≥12 chars) + **área de destino**; sugestão de categoria/área pelo nome e tipo.
- Ficheiros sem descrição/título/categoria ficam **Por organizar** (filtro + badge + modal de organização).
- Nenhum upload fica sem metadados; mover área via `updateSchoolFileMeta.area`.

## Ciclo 32 — pastas, selecção e modal expansível

- Pastas em `siga_files` (`is_folder`, `parent_id`); **Nova pasta**, breadcrumb e navegação por duplo clique.
- Multi-selecção com checkboxes; barra **Mover** para raiz ou pasta (`moveSchoolFiles`).
- Modais **Expandir** (`FilePickerModal`, inquérito, mover) para trabalho em ecrã largo.
- Eventos `folder_created` / `moved`. SQL: reaplicar `APPLY_ENROLLMENT_AND_PREMIUM.sql`.

## Ciclo 33 — recibos, talões e ID pesquisável

- ID simples `PREFIX-AAMMDD-XXXX` (`document-code.ts`); coluna/pesquisa `reference_code` na biblioteca.
- Categorias financeiras `recibo` / `talao` / `fatura`; stubs `.txt` via `insertFinanceArchive` (idempotente por ID).
- Tesouraria arquiva ao receber, emitir fatura e criar plano; impressão de talão reutiliza o mesmo ID estável.
- UI: inquérito com ID, lista/grelha com mono ID, ficha do aluno mostra recibos/talões ligados.
- SQL: categoria `talao` no CHECK + índice `siga_files_reference_idx` em `APPLY_ENROLLMENT_AND_PREMIUM.sql`.

## Ciclo 34 — Planos de Aula

- `/planos-aula` (sidebar → Área Pedagógica): cartões agrupados por trimestre, filtráveis por turma/disciplina/trimestre/texto.
- Modal `LessonPlanModal` (padrão `PremiumModal`, o mesmo usado no Centro de Avaliação): turma, disciplina, trimestre, título, conteúdo, anexo (`PickFileButton` da biblioteca), listas repetíveis de **Avaliações** e **Provas** (nome definido pelo professor + quantidade).
- **Não é um motor de notas novo.** Cada avaliação/prova do plano materializa-se em `siga_assessment_items` (avaliação → `component: MAC`, prova → `component: NPP`) — o Centro de Avaliação já existente (`AssessmentCenter.tsx`) lança as notas, calcula `componentAverage` e empurra para a pauta oficial via `upsertTermGradesBatch`. A pauta continua fixa a MAC/NPP/NPT.
- Editar um plano nunca apaga notas já lançadas: itens do Centro de Avaliação com pontuação ficam ligados por `lesson_plan_component_id` mesmo que a definição do plano mude; só remove itens _sem_ nota quando a quantidade planeada desce.
- Tabelas novas: `siga_lesson_plans`, `siga_lesson_plan_components`; coluna nova `siga_assessment_items.lesson_plan_component_id`. Tudo em `APPLY_ENROLLMENT_AND_PREMIUM.sql`.

## Ciclo 35 — mensagens com anexo, fluxo corrigido e página de perfil

- **Anexo nas mensagens internas**: botão de clipe (`PickFileButton`) na conversa, chip antes de enviar, bolha da mensagem mostra o ficheiro e abre com `signSchoolFile`. Mensagem pode ir só com anexo (sem texto). Colunas novas `siga_direct_messages.attachment_file_id/attachment_file_name`; `body` deixou de ser `NOT NULL`.
- **Bug de fluxo corrigido**: `listInboxPreviews` só olhava para mensagens recebidas — uma conversa que só tu iniciaste (sem resposta ainda) não aparecia em lado nenhum. Agora `InboxPreview` separa `lastActivityAt` (qualquer direcção, para pré-visualização/ordenação) de `lastIncomingAt` (só recebidas, para o ponto de não-lida).
- **`/perfil`**: página dedicada (foto, nome, telemóvel) extraída para `src/features/auth/ProfileSettingsPanel.tsx` — usada tanto na página como no painel Conta → Perfil do Centro de Configurações (uma só fonte). O menu da conta na sidebar abre `/perfil` em vez do modal.

## Próximos passos úteis

1. Utilizador aplica o SQL; confirmar as 6 tabelas no resultado do script.
2. Manter commits pequenos por alteração e nunca incluir `.env` nem `.claude/worktrees/`.
3. Aceitar candidatura cria aluno, encarregado (se veio no formulário) e opcionalmente turma (`classGroupId`). Sem turma fica `applicant`. Em `/alunos`: **Turma** (candidato), **Mudar** (activo), **Estado** e PDF **Oficial**. Campanha de matrícula (Definições) liga a `/documentos#modelos` para talões.
4. Emitir em `/documentos` usa o modelo `.hbs` escolhido em **Modelos de impressão** (Ver / Editar / Usar). Cabeçalho da página tem botão **Modelos** (`#modelos`). Atalhos: Definições → Escola → **Atalhos**, `/configuracoes?painel=documentos` ou campanha de matrícula. A lista de pedidos também tem **Oficial**. A ficha do aluno emite **Boletim**, **Histórico**, **Declaração** e **Mais modelos** (dossiê, certificado, credenciais). Pedagógica: pauta, boletim, mapa, acta e validação. Workspace do professor: **Diário**. Relatórios académicos e talões de candidatura/matrícula também. Sem modelo ou se falhar, cai no PDF MINED. Pedidos já emitidos têm **PDF**. Pedidos em curso: **Recusar** e **Cancelar**. Ficha também: **Fatura** e **Documento**.
5. Pedagógica: **Atribuir professor** liga `class_subjects.teacher_id`. Disciplinas: **Editar** e **Desactivar**. Horários: **Copiar** slot para outro dia. Na pauta, **Copiar trimestre anterior** preenche MAC/NPP/NPT (depois Guardar). Cabeçalho da área pedagógica tem **Pauta Oficial** e **Turmas Oficial**; grelha e centro de avaliação também. Centro de avaliação: **Imprimir** usa `issuePrintDocument` (pauta oficial), não `window.print`.
6. Dashboard: candidatos abrem Confirmar Matrícula. Comunicados publicados aparecem no início. Em `/comunicacoes`: **Editar**, **Arquivar**, **Republicar**, **Imprimir** e **Oficial**. `/calendario` e `/alunos` **Oficial** usam o modelo de serviço. `/pessoas` tem **Oficial** do corpo docente e do registo central. `/acessos` imprime **Credenciais**, **Oficial contas** e **Oficial equipa**. Ficha do professor também tem **Credenciais**. `/acessos`: **Reenviar** copia o link de convite/recuperação.
7. `/faturas`: **Fatura** e **Receber**/**Recibo** usam o modelo `service-document` com secção **Dados de pagamento** (IBAN em Definições → Financeiro). Lista de faturas tem **Oficial**. Sem recibos: **Anular**. Ficha do aluno (Admin) também recebe. Caixa: **Recibo** no lançamento e **Oficial** na lista. Planos: **Talão**. Relatório financeiro **Oficial** (completo) e **Oficial cobrança** / **Oficial categorias** — todos com IBAN/logótipo quando configurados. Dashboard mostra pedidos de documento pendentes e liga a `/documentos`.
8. Ficha do professor: **Editar**, **Atribuir disciplina** e **Desligar**. Registo central: **Editar** pessoa. Relatórios académicos têm PDF **Oficial**. Relatórios financeiros também têm **Oficial**.
9. `/calendario`: Admin/Secretaria **Editar** e **Apagar** períodos (`terms`). Cada período tem **Imprimir**; a lista tem PDF **Oficial**. Pedagógica → Horários: lista de slots com **Remover** (`deleteScheduleSlot`). Planos de pagamento pendentes têm **Cancelar**.
10. Convite/cargo Professor cria ficha HR (`ensureTeacherHrRecord`). Liga `teachers.user_id` se a coluna existir; senão resolve por email.
11. Gateway real Multicaixa/Unitel — fora de âmbito (só config + plano `pending_gateway`).
12. Sidebar: hover expande, modal encolhe. Árvore Curso/Nível → turmas → disciplinas. Primário/iniciação abre pauta da turma; I/II ciclo abre a disciplina do professor.
13. Integrações catalog-ready estão ligadas em todos os módulos autenticados (toolbars `InstalledModuleTools`, WhatsApp/Resend por linha, botões SIGE/AGT). Relatórios académicos e financeiros copiam resumo Resend. Definições → Integrações reflecte estado real; Gmail mostra nota quando Resend já está instalado. `/alterar-senha` explica 2FA. Configurações vivem no modal (`SettingsCenter`); `/configuracoes?painel=integracoes` abre o painel e redirecciona para `/`; `/configuracoes?painel=documentos` abre `/documentos#modelos`.
14. **Identidade Angola:** BI/NIF com `AngolaIdentityField` (validar formato + BI online) em `/pessoas`, matrícula interna e `/matricula/$slug` — validação Zod no servidor (`personCoreFieldsSchema`). Escola: NIF AGT, logótipo (URL ou upload), dados bancários e AGT em Definições. Perfil: telemóvel em Definições → Conta (`profiles.phone` no SQL). Ficha da pessoa: lista `person_documents` e **Adicionar documento**; BI sincroniza `national_id`. Aplicar `APPLY_IN_SQL_EDITOR.sql` inclui bucket `school-logos`.

## Checklist manual — integrações (após SQL)

1. Definições → Integrações: instalar **WhatsApp Business**, **Resend** e **Multicaixa Express** (consentimento + capacidades).
2. Waffle: apps aparecem na secção correcta; estado «Ligado» após instalar.
3. `/comunicacoes`: publicar canal E-mail copia texto; cartões têm WhatsApp/Resend.
4. `/matricula/$slug` (público): **WhatsApp** e **E-mail** da secretaria só com integração; sem instalar, contactos ocultos.
5. `/financeiro` e `/faturas`: toolbars Multicaixa/AGT; plano com referência EMIS.
6. `/acessos`: Reenviar + E-mail/WhatsApp na linha de convite.
7. `npm test` (Node 24) — inclui `tests/integrations/*` e `tests/documents/*`. CI (`.github/workflows/ci.yml`) corre lint + test + build.
8. **Desempenho:** Definições → Desempenho ou consola `window.__sigaPerf`. Pré-busca ao hover no menu (dados + chunks Recharts); pesquisa debounced 220 ms. Impressão oficial carrega motor só ao clicar (`print-issue-loader`).
9. `/documentos#modelos`: escolher **Usar** num modelo; emitir declaração na ficha do aluno e lista **Oficial** em comunicados/caixa.

## Não seguir relatórios antigos

Explorações pré-ciclo 1–6 estão desactualizadas. Já existem: `/matricula/$slug`, `SequentialSheetModal`, WhatsApp na turma, `ListFilterBar` + param `lf`, feed ICS (`terms`), MFA TOTP, grants, planos de pagamento, workspace do professor, lançador waffle no cabeçalho (apps + integrações, incl. AGT). Cada integração tem pacote de instalação com permissões. Funções entram nos ecrãs via `InstalledModuleTools` / `hasCapability`. Rotas públicas: `publicInstalledProviderIds` + `publicSchoolPhone` / `publicSchoolEmail` (telefone/e-mail só quando WhatsApp/Resend instalados). Sem HTTP a terceiros.

Testes: **Node 24**. Node 26 neste macOS aborta (`dyld libc++`, exit 134).
