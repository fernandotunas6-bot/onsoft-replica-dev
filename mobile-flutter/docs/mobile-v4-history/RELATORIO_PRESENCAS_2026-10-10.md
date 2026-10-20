# Mobile V4 — calendário e presenças canónicas, 10/10/2026

Continuação da PR #116 sobre `e551d784`. Código destinado exclusivamente ao preview `staging-mobile-v4-pr116`; o estado e commit exacto da publicação são registados na descrição actual da PR.

## Funcionalidades deste ciclo

- Endpoint HTTP autenticado `GET /api/mobile-v4/schools/:schoolId/attendance?role=aluno|professor&from=YYYY-MM-DD&to=YYYY-MM-DD`, com intervalo obrigatório de até 31 dias. Identidade, MFA, vínculo e âmbito académico são validados no servidor. IDs de alunos enviados na URL não decidem autorização.
- Leitura das chamadas existentes em `siga_attendance_sessions` e marcações de `siga_attendance_records`. Alunos recebem apenas as próprias marcações nas disciplinas das suas matrículas activas; professores recebem somente chamadas atribuídas ao próprio docente e alunos da turma autorizada.
- Marcações de chamadas pendentes/canceladas não são publicadas. Não se deduz uma falta da ausência de marcação, nem uma aula de um slot do horário.
- Ocorrências próprias do professor em `hr_teacher_lesson_occurrences`, separadas da chamada dos alunos. Só seis campos académicos são seleccionados; não são lidos salários, contratos, notas internas ou justificações. Estados prevista/confirmada/rejeitada/cancelada são preservados, sem converter rejeição em falta.
- Calendário mensal com cores, navegação por teclado, selecção do dia, detalhe da chamada e actualização. Usa os ícones e classes CSS existentes. Respostas anteriores a mudança de mês/escola/conta são descartadas; 401/403 limpa o contexto institucional.
- Contrato estrito validado no servidor e no browser: escola/papel/período, disciplinas, próprio aluno, docente, datas/horas, duplicados, estados e campos adicionais. Consultas truncadas ou incoerentes falham sem resultados parciais.

## Verificação

- 117 testes Mobile e 72 testes seleccionados backend/RLS aprovados.
- 39 verificações em PostgreSQL local PGlite, executando as funções reais de resolução de âmbito e projecção, com SQL parametrizado e dados exclusivamente de ensaio. Incluem outra escola, colegas, docentes diferentes, chamadas pendentes, ano anterior, registos eliminados e respostas truncadas/indisponíveis.
- Metadados e restrições das três tabelas consultados no Sga através de SELECT ao catálogo, sem ler registos pessoais. Horas docentes são `time without time zone`; horas das chamadas são texto nullable. Os fixtures foram alinhados com esses tipos reais.
- TypeScript raiz/Mobile, lint/formatação, build raiz, builds Mobile/PWA/módulo/Worker e verificador PWA aprovados. A validação publicada do CI será confirmada na PR.
- Ensaios de interface/SQL usam dados controlados locais e não demonstram login remoto positivo, MFA de contas reais, renovação real nem produção RLS.

## Limites

Só consulta, em disciplinas/anos/matrículas actualmente activos. Ocorrências históricas de disciplinas já não atribuídas não entram neste âmbito. Consultas com mais de 1000 linhas por leitura são recusadas; paginação ainda pendente. Justificações, pedidos de alteração e escrita de chamada não estão implementados neste Mobile.

Continuam pendentes notas, planos completos, submissões, chat, notificações, documentos/ficheiros, comandos transaccionais com auditoria/idempotência e percursos com contas reais autorizadas. Não se declara o Mobile integralmente funcional.

Não houve alteração de esquema, migração, escrita de dados na base Sga ou publicação do portal principal.

## Chamada do professor (escrita, 10/10/2026)

Primeira escrita académica do Mobile. Sem migrações: grava nas tabelas que o portal já usa (`siga_attendance_sessions`, `siga_attendance_records`) e com as **mesmas guardas**. `assertAttendanceNotLocked` e `recomputeAttendanceRates` passaram de `attendance-server.ts` para `src/features/pedagogica/attendance-guards.ts`, sem mudar a lógica. O portal e o Mobile importam-nas daí; o Worker do Mobile não pode levar módulos com `createServerFn`.

- `POST /api/mobile-v4/schools/:schoolId/attendance-call` com `{ role: "professor", classSubjectId, date, records: [{ studentId, status }] }` (1–500 alunos, sem repetidos; estados `present`, `absent`, `excused`, `late`, `early_exit`). POST, origem da aplicação, sessão `aal2`, corpo estrito (a escola vem só da rota), escrita permitida na Pedagógica.
- No servidor (`attendance-call.server.ts`), pela ordem do portal:
  1. A turma-disciplina tem de estar no âmbito do professor e em `class_subjects` com ele.
  2. O dia não pode ser futuro (calendário de Luanda).
  3. A sessão do dia é encontrada ou aberta `pending`. Duas sessões no mesmo dia dão 409: o Mobile não adivinha o tempo.
  4. São recusadas a sessão de outro professor (403), a aula cancelada (409), a pauta do período ou anual já oficial (409) e a chamada já fechada (409: corrige-se no portal, com motivo e auditoria).
  5. Só entram alunos matriculados na turma, activos ou pendentes; uma lista truncada dá 503.
  6. Um só upsert, depois o recálculo da taxa, e a sessão fecha `completed`.
- Interface: no calendário do professor, no dia escolhido (hoje ou antes), «Fazer chamada» para as turmas com aula nesse dia. A turma conta se tiver horário publicado em vigor nesse dia da semana, uma ocorrência docente ou uma chamada pendente; as que já estão fechadas ou canceladas ficam de fora. Todos começam presentes, cada aluno tem a sua escolha, e a gravação pede confirmação com o resumo. Cada recusa do servidor tem a sua mensagem (o código passa a vir em `ApiError.code`).

Verificação: 212 testes Mobile (tipos, lint, formatação, worker do domínio, os três builds — o `build:connected` apanhou e obrigou a separar as guardas — e PWA). Na raiz: 7 testes da escrita com base simulada (ordem pauta → gravar, sessão nova, recusas, lista truncada, falhas sem sucesso falso), o teste HTTP da rota e os testes estruturais das presenças, actualizados para o módulo partilhado. **Não há ensaio em PostgreSQL desta escrita** nem com contas reais. Correcção de chamada fechada, justificações e chamada por tempo (vários no mesmo dia) continuam só no portal.
