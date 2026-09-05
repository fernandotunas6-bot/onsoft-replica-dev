---
name: siga-alunos
description: >-
  Extends SIGA student records and internal enrollment. Use when editing
  alunos, fichas, StudentEnrollmentSheet, enrollNewStudent, or
  src/features/students.
---

# SIGA · Alunos

- Rotas: `src/routes/alunos/index.tsx`, `src/routes/alunos/$studentId.tsx`
- Domínio: `src/features/students/{schemas,server,academic-status,status-history}.ts`, `StudentEnrollmentSheet.tsx`
- UI: `StudentStatusBadge`, `StudentFinanceBadge`, `StudentStatusHistoryTimeline`, `StudentExtensiveModal`
- Testes: `tests/students/schemas.test.ts`, `tests/students/academic-status.test.ts`, `tests/students/status-history.test.ts`
- Acesso: módulo `pessoas` (Admin/Secretaria). Público não entra aqui.

## Regras

1. Matrícula interna nova: `SequentialSheetModal` / `StudentEnrollmentSheet`, não reinventar o form. Com `whatsapp.notices`, o passo Contactos tem atalho WhatsApp no telefone.
2. Persistência de filtros: `usePersistedListFilters("alunos", …)` + `validateSearch` com `.passthrough()`. Lista: CSV, PDF e **Oficial** (modelo de serviço).
3. RPCs/tabelas SGA: `students`, `enrollments`, `people`. Escrita via admin client.
4. Candidatura pública aceite cria aluno SGA via `decideEnrollmentApplication`. Com turma fica activo; sem turma fica `applicant` (Confirmar Matrícula filtra este estado). A lista `/alunos` tem **Turma** para candidatos, **Mudar** para activos já colocados (`enrollStudentInClass`) e **Estado** (`changeStudentStatus`).
5. Ficha do aluno com matrícula activa: **Boletim**, **Histórico**, **Declaração** e **Mais modelos** (dossiê, certificado, credenciais) usam os `.hbs` escolhidos em Documentos (com fallback PDF). **Foto** da biblioteca (PNG/JPEG) via `applyLibraryPhotoToPerson` → `people.photo_url` e marca o ficheiro como `foto` relacionada. Painel **Arquivos do aluno** lista a biblioteca ligada (`related_person_id`) e permite **Usar no perfil**.
6. Ficha também emite **Fatura** (`issueInvoice`) e **Documento** (`createDocumentRequest`). Situação financeira deriva das faturas (`paymentStatusFromInvoices`). Admin pode **Receber** e descarregar **Recibo**. Com WhatsApp/Resend instalados: atalho no telefone do aluno/encarregado, **E-mail**/**WhatsApp** na fatura e nos documentos oficiais (boletim/histórico). A lista `/alunos` também tem WhatsApp no telefone. **Sync PayFlow** na ficha/modal (`syncStudentToPayflow`).
7. **Taxa de presença** vem de `enrollments.attendance_rate`. Na ficha, Admin/Secretaria **Registar** (0–100). O dashboard e as turmas mostram a média. Sem coluna, aplicar `APPLY_IN_SQL_EDITOR.sql`. O boletim inclui a percentagem quando existe.
8. **Estados unificados (Ciclo 55):** `deriveAcademicStatus` / `deriveFinancialSnapshot` — académico e financeiro são independentes. Lista com filtros rápidos e badges. Mudanças de estado (criação, matrícula, candidatura aceite, turma, lote) gravam `student_status_history` via `recordStudentStatusHistory`. Modal → aba Histórico. SQL: `APPLY_ENROLLMENT_AND_PREMIUM.sql`.
