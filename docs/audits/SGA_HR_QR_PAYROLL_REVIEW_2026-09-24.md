# SGA — revisão do fluxo real de QR docente e remuneração (24-09-2026)

## Fontes verificadas

- Código: `src/features/hr/teacher-lessons.ts`, `TeacherAttendancePanel.tsx` e RPC `public.hr_redeem_teacher_qr` lida em Sga.
- Base Sga activa (consultas apenas de leitura): tabelas `hr_teacher_qr_sessions` e `hr_teacher_lesson_occurrences`, RPCs `hr_redeem_teacher_qr` e `hr_evaluate_teacher_attendance_assurance` presentes.
- Na consulta: zero sessões QR, zero ocorrências RH e zero eventos de compensação provenientes de `teacher_lesson_occurrence`. Os quatro indicadores do preflight retornaram zero; este resultado reflecte a ausência de dados de teste, não aprovação do comportamento futuro.

## Sequência real

1. Administração ou Tesouraria emite QR temporário para ocorrência RH. A server function revoga os QR activos anteriores e cria uma sessão hash + expiração de cinco minutos.
2. Docente autenticado lê o QR; a server function resolve o vínculo `teachers.user_id`, consulta a sessão e calcula um score de assurance.
3. A RPC `hr_redeem_teacher_qr` bloqueia sessão e ocorrência `FOR UPDATE`, valida `auth.uid()` e grava entrada ou saída.
4. Antes da migração aplicada nesta data, o check-out podia criar um evento salarial validado pelo próprio docente. A RPC agora exige assurance recente, regista a saída como `pending_review` e aguarda validação independente de RH.

## Correções no PR e migrações aplicadas

- Emissão falha se a revogação da sessão anterior devolver erro; vínculo `teachers.user_id` atribuído a outro utilizador não é reutilizado, e o backfill verifica a atualização.
- `20260924_hr_qr_active_session_guard.sql`: índice único parcial para apenas uma sessão activa por escola, ocorrência e operação. O preflight não encontrou duplicados; teste concorrente não executado por instrução do utilizador.
- `20260924_hr_qr_payroll_review_gate.sql`: substituição completa da RPC, obtida da definição efectiva na base e modificada para exigir assurance recente do próprio docente e horário oficial publicado nas aulas programadas; deixa o check-out em `pending_review`, sem criar compensação aprovada automaticamente. Inclui verificação de hash da definição actual e aborta se a RPC tiver mudado desde a captura; **aplicada à Sga em 24-09-2026, sem testes funcionais a pedido do utilizador**.
- O domínio passa a manter a compensação `pending` qualquer que seja a pontuação do assurance QR. O portal deixa de anunciar elegibilidade salarial antes da revisão do RH e usa a data civil `Africa/Luanda` para destacar aulas do dia.

## Confirmação salarial independente

A leitura da RPC `hr_confirm_teacher_lesson` revelou outro caminho que insere directamente um evento salarial validado com a quantidade contratual, sem exigir entrada, saída ou revisão da quantidade. O acesso à RPC está concedido a `authenticated`, mas as políticas das tabelas restringem a gravação a Administração/Tesouraria. O ficheiro `20260924_hr_confirm_independent_review.sql` aplicou verificações adicionais na RPC: revisor com papel RH diferente do docente, entrada e saída ordenadas, quantidade remunerável positiva revista, referência para evidência não QR e horário publicado em ocorrências programadas. O evento passa a usar a quantidade revista. Para a evidência QR, a confirmação exige sessões de entrada e saída usadas pelo docente e preserva a referência da sessão de saída. Contém preflight da definição efectiva; **aplicado à Sga em 24-09-2026, sem testes funcionais a pedido do utilizador**. A interface de revisão explícita e os testes transaccionais ainda precisam ser concluídos.

O provisionamento de contas e a aceitação de convites também foram endurecidos: e-mail da sessão obrigatório, busca de identidade sem duplicados e vínculo condicional que nunca substitui outro `user_id`. A criação de conta faz verificação antes de criar o utilizador; concorrência e recuperação de falhas após a criação ainda requerem teste integrado. `20260924_hr_identity_unique_school_login.sql` criou índices únicos de login por escola para pessoas activas e docentes; a Sga actual não tem grupos duplicados para estes vínculos.

## Gate de implantação e fecho do ciclo

1. Num ciclo posterior, validar as quatro migrações já aplicadas num clone isolado da Sga PostgreSQL 17.
2. Testar emissões concorrentes: uma única sessão activa para a mesma aula/operação; erro de revogação não gera nova sessão.
3. Testar dois resgates concorrentes do mesmo token, token expirado, escola e docente diferentes, entrada sem aula publicada, saída sem entrada e relógio fora da janela.
4. Confirmar na mesma transacção que check-out cria evidência, mas não evento de compensação validado pelo docente. Exercitar a RPC de confirmação com revisor independente, quantidade revista, justificação, contestação e auditoria antes de transformar em folha salarial.
5. Conciliar `hr_teacher_lesson_occurrences` com o horário publicado e com `academic_evidence` sem duplicar IDs nem QR; depois testar ponta a ponta no portal e em folha mensal. A migração de evidência ainda é um modelo separado e não está ligada a este fluxo.
6. Nunca activar descontos automáticos por QR ausente, catraca isolada ou 22 dias fixos. O fecho financeiro só deve usar calendário contratual, revisões concluídas e autorização RH persistida.

**Estado:** as quatro migrações foram aplicadas à Sga activa em 24-09-2026 e constam no histórico. As correções de código permanecem no PR em rascunho. A pedido do utilizador, não foram realizados testes funcionais nem criada uma branch de teste. A implantação do código, o fluxo de aprovação de RH, a conciliação ponta a ponta e a revisão jurídica/laboral continuam pendentes.

## Identidade docente — impacto medido

Consulta de leitura à Sga encontrou **7 docentes activos sem `teachers.user_id` nem `people.user_id`**, zero docentes ligados directamente e zero vinculáveis pelo `people.user_id`. Remover a associação automática baseada apenas em e-mail fecha um atalho de identidade, mas esses sete cadastros precisam de vínculo de login feito pela administração e confirmado antes de usar QR. A emissão para secretaria continua possível; o resgate por docente permanece bloqueado até existir vínculo explícito. Não preencher IDs por aproximação de nome ou e-mail.
