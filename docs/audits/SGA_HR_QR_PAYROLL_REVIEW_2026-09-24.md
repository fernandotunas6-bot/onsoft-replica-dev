# SGA — revisão do fluxo real de QR docente e remuneração (24-09-2026)

## Fontes verificadas

- Código: `src/features/hr/teacher-lessons.ts`, `TeacherAttendancePanel.tsx` e RPC `public.hr_redeem_teacher_qr` lida em Sga.
- Base Sga activa (consultas apenas de leitura): tabelas `hr_teacher_qr_sessions` e `hr_teacher_lesson_occurrences`, RPCs `hr_redeem_teacher_qr` e `hr_evaluate_teacher_attendance_assurance` presentes.
- Na consulta: zero sessões QR, zero ocorrências RH e zero eventos de compensação provenientes de `teacher_lesson_occurrence`. Os quatro indicadores do preflight retornaram zero; este resultado reflecte a ausência de dados de teste, não aprovação do comportamento futuro.

## Sequência real

1. Administração ou Tesouraria emite QR temporário para ocorrência RH. A server function revoga os QR activos anteriores e cria uma sessão hash + expiração de cinco minutos.
2. Docente autenticado lê o QR; a server function resolve o vínculo `teachers.user_id`, consulta a sessão e calcula um score de assurance.
3. A RPC `hr_redeem_teacher_qr` bloqueia sessão e ocorrência `FOR UPDATE`, valida `auth.uid()` e grava entrada ou saída.
4. No check-out, a RPC pode calcular `payable_quantity`, criar `hr_compensation_events` com `validation_status='validated'` e `validated_by` igual ao docente que leu o QR, e marcar a ocorrência como `confirmed`. A decisão do assurance calculada no passo 2 não entra como parâmetro nem é revalidada na mesma transacção da RPC.

## Correções preparadas no PR

- Emissão falha se a revogação da sessão anterior devolver erro; vínculo `teachers.user_id` atribuído a outro utilizador não é reutilizado, e o backfill verifica a atualização.
- `20260924_hr_qr_active_session_guard_staged.sql`: índice único parcial para apenas uma sessão activa por escola, ocorrência e operação. Exige preflight e teste concorrente antes de aplicar.
- `20260924_hr_qr_payroll_review_gate_staged.sql`: substituição completa da RPC, obtida da definição efectiva na base e modificada para exigir assurance recente do próprio docente e horário oficial publicado nas aulas programadas; deixa o check-out em `pending_review`, sem criar compensação aprovada automaticamente. Inclui verificação de hash da definição actual e aborta se a RPC tiver mudado desde a captura; **não foi executada**.
- O portal deixa de anunciar elegibilidade salarial antes da revisão do RH e usa a data civil `Africa/Luanda` para destacar aulas do dia.

## Gate de implantação e fecho do ciclo

1. Preparar clone isolado da Sga PostgreSQL 17 com as migrations RH actuais. Confirmar a definição da RPC e o estado dos dados antes de aplicar os dois ficheiros preparados.
2. Testar emissões concorrentes: uma única sessão activa para a mesma aula/operação; erro de revogação não gera nova sessão.
3. Testar dois resgates concorrentes do mesmo token, token expirado, escola e docente diferentes, entrada sem aula publicada, saída sem entrada e relógio fora da janela.
4. Confirmar na mesma transacção que check-out cria evidência, mas não evento de compensação validado pelo docente. Simular revisão do RH por papel independente com justificação, contestação e auditoria antes de transformar em folha salarial.
5. Conciliar `hr_teacher_lesson_occurrences` com o horário publicado e com `academic_evidence` sem duplicar IDs nem QR; depois testar ponta a ponta no portal e em folha mensal. A migração de evidência ainda é um modelo separado e não está ligada a este fluxo.
6. Nunca activar descontos automáticos por QR ausente, catraca isolada ou 22 dias fixos. O fecho financeiro só deve usar calendário contratual, revisões concluídas e autorização RH persistida.

**Estado:** correções no PR em rascunho; produção preservada; teste SQL real, integração e revisão jurídica/laboral ainda pendentes.

## Identidade docente — impacto medido

Consulta de leitura à Sga encontrou **7 docentes activos sem `teachers.user_id` nem `people.user_id`**, zero docentes ligados directamente e zero vinculáveis pelo `people.user_id`. Remover a associação automática baseada apenas em e-mail fecha um atalho de identidade, mas esses sete cadastros precisam de vínculo de login feito pela administração e confirmado antes de usar QR. A emissão para secretaria continua possível; o resgate por docente permanece bloqueado até existir vínculo explícito. Não preencher IDs por aproximação de nome ou e-mail.
