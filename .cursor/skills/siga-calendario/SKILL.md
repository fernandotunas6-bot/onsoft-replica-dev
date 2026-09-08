---
name: siga-calendario
description: >-
  Extends SIGA academic calendar and mobile ICS sync. Use when editing
  /calendario, /calendario/ics, terms, or src/features/calendar.
---

# SIGA · Calendário

- Rotas: `calendario.tsx`, `calendario.ics.tsx` (público)
- Domínio: `calendar/server.ts` (lê **`terms`**), `calendar/feed.ts` (token + ICS)
- Público: `/calendario/ics` em `src/lib/public-paths.ts`

## Regras

1. No SGA o calendário são **períodos (`terms`)**, não `calendar_events`.
2. Feed ICS também mapeia `terms` → VEVENT.
3. Token em `calendar_feed_tokens` (SQL premium). Sem tabela, mensagem clara.
4. Admin/Secretaria **edita** e **apaga** períodos (`updateCalendarEvent` / `deleteCalendarEvent`). Apagar falha se o período tiver notas ligadas.
5. Lista tem CSV, PDF simples, **Oficial** e **Imprimir** no período (modelo `service-document`, fallback `exportOfficialPautaPdf`). **Subscrever ICS** copia o feed; com Google/Apple instalados aparecem botões que abrem o guia oficial.
6. Topbar: `TopbarCalendar` reutiliza `listCalendarEvents` + `buildUpcomingCalendarItems` (períodos + feriados Angola) e `listDayAgendaLessons` (aulas do horário). Cada aula oferece CTA Chamada/QR via `agendaLessonActions` (QR com `turma`/`disciplina`/`data`; chamada com `dia`).
