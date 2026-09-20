---
name: siga-dashboard
description: >-
  Extends the SIGA home dashboard and teacher workspace. Use when editing
  /, getDashboardOverview, or TeacherWorkspacePanel.
---

# SIGA · Dashboard

- Rota: `src/routes/index.tsx`
- Overview: `src/features/dashboard/server.ts`
- Professor (início): `TeacherPortalDashboard` — aulas de hoje, chamada rápida,
  CTA **Assinar presença (QR)** → `/professor/presenca`, menu pedagógico.
- Professor (ficha): `TeacherWorkspacePanel` (turmas, materiais, matrículas, horário + ICS)

Não substituir o dashboard admin. O painel docente é **aditivo** quando `role === "Professor"`. **Diário** imprime o horário no modelo pedagógico. Com integrações: Classroom/Moodle/Canvas/Teams/OneDrive/Turnitin nas turmas; Zoom e Teams em cada slot; Google/Apple no ICS.
Sidebar já filtra por `canAccessPath(..., grants)`. Hover expande; diálogo aberto encolhe. Árvore Curso/Nível em `AcademicNavTree`.
Grupo **Principal** (admin): Início + Calendário Lectivo. Topbar: `TopbarCalendar` (mini-agenda de períodos/feriados).
Admin início: `TodayAtSchoolCard` («Hoje na escola») via `getSchoolTodayOps`. Professor: bloco **Próxima aula** no portal.
Topbar: escola · ano · período; ⌘K = `CommandPalette` (páginas + acções). Waffle = apps/integrações.

Fluxo tutor (hora/aula): Início → QR em `/professor/presenca` → chamada de alunos → check-out QR. Ver skill `siga-rh` (Ciclo 56.2–56.5).

`totals.activeStudents` = estado `active`; `totals.applicants` = candidatos sem matrícula confirmada. O cartão de estudantes com candidatos liga a `/alunos?action=confirmar`. `totals.documentPending` = pedidos `submitted`/`in_review`; o cartão liga a `/documentos`. `totals.attendanceAverage` = média de `enrollments.attendance_rate` nas matrículas activas.

Comunicados enviados (`school_announcements.status = sent`) e agendados já vencidos aparecem no dashboard com **Imprimir** (modelo `service-document`). Registos com `deleted_at` ficam ocultos. Sem tabela, a lista fica vazia.

O sino do cabeçalho lista avisos operacionais (`listSchoolAlerts`): candidaturas pendentes, alunos `applicant`, pedidos de documento e faturas em atraso — mais as mensagens internas por ler.

Destaques: catálogo `src/features/spotlight/catalog.ts`. Administrador gere textos, **ícone/cor/tipo**, **ligação do botão** (página SIGA, URL ou Definições), cargos, datas (Luanda) e **onde aparece** (painel da conta e/ou início) em Definições → **Destaques**. Notas/novidades/promos saem no dashboard; atalhos `function` só no drawer, salvo override. `listSpotlightConfig` / `saveSpotlightOverrides` em `school_settings` domínio `spotlight`. Filtra por cargo, calendário, superfície e `canAccessPath`.
