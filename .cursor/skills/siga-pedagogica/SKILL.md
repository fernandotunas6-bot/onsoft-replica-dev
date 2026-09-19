---
name: siga-pedagogica
description: >-
  Extends SIGA academic workspace: turmas, disciplinas, notas, horários and
  WhatsApp class groups. Use when editing /pedagogica, ClassGroupSheet,
  term grades, timetable, or src/features/academic.
---

# SIGA · Pedagógica

- Rota: `src/routes/pedagogica.tsx` (`tab` em search: turmas|disciplinas|notas|horarios)
- Domínio: `src/features/academic/{schemas,server,AssessmentCenter,GradePautaSheet,ClassGroupSheet,sga-grades}.ts`
- Currículo: `src/lib/angola-academic.ts` · config em `school_settings.domain = pedagogy`
- Testes: `tests/academic/schemas.test.ts`, `tests/academic/angola-academic.test.ts`
- Acesso: Admin/Secretaria/Professor (Professor lança notas na pauta)

## Regras

1. Nova turma: `ClassGroupSheet` (folha sequencial). Edição pode ficar no `QuickFormModal`.
2. WhatsApp: `whatsapp_invite_url` / `whatsapp_group_name`. Se as colunas não existirem, gravar sem elas. `attendance_rate` da turma é a média das matrículas activas (`enrollments.attendance_rate`). Materiais da turma: `ClassMaterialsPanel` nos cartões (`siga_files.class_group_id`).
3. Notas: `AssessmentCenter` é o workspace. Âmbitos Alunos/Disciplinas/Turmas/Classes geram vistas diferentes (dossiê, grelha, mapa). Helpers em `assessment-views.ts`. Sem tabelas SQL, degrada para MAC/NPP/NPT. **Copiar trimestre anterior** preenche MAC/NPP/NPT do período anterior (ainda precisa de Guardar). Com Turnitin instalado, a pauta (`GradePautaSheet` e o centro) copia o lote e abre o guia oficial.
4. Fecho: checklist + `setTermLock`. Lote e cópia TSV na grelha. Recursos/exames têm tabelas próprias. Documentos: pauta, boletim, relação, mapa + código `SIGA-`.
5. Documentos oficiais: pauta/boletim/mapa/acta/validação tentam o modelo `.hbs` activo (`issuePrintDocument`) e caem em `exportOfficialPautaPdf` + `AngolaEmblem`. **Relação de alunos** usa `service-document`. Cabeçalho de `/pedagogica` tem **Pauta Oficial** e **Turmas Oficial**. `GradePautaSheet` tem **Oficial** em disciplina, geral e anual. O workspace do professor tem **Diário** a partir do horário. Modo Pauta ≠ modo edição.
6. Níveis/cursos: Configurações → Pedagógico (`PedagogicalSettingsPanel`). Não reescrever turmas; filtrar pelo que a escola lecciona.
7. Horários: `timetable_slots` + `class_subjects.teacher_id`. Atribuir docente: `assignClassSubjectTeacher`. Desligar: `unassignClassSubjectTeacher` (fica a disciplina, sai o professor). Sem ligação a árvore do professor fica vazia. Remover slot: `deleteScheduleSlot` (marca `inactive`). **Copiar** reutiliza `createScheduleSlot` noutro dia. Disciplinas: **Editar** (`updateSubject`) e **Desactivar** (`deactivateSubject`, bloqueia se ainda houver `class_subjects` activos).
8. Relatório: `src/routes/relatorios.academicos.tsx` — CSV, PDF simples e **Oficial** (`service-document` com mapa + pauta detalhada; fallback MINED). Botão **SIGE** com ícone quando instalado; **WhatsApp** e **E-mail** Resend no cabeçalho. LMS na turma e na disciplina: Classroom/Moodle/Canvas e, se instalados, Trabalhos, Notas Moodle, Trabalhos Canvas, Equipa Teams e OneDrive (só URLs oficiais). A pauta simples (`GradePautaSheet`) também mostra Trabalhos/Moodle/Canvas e, com WhatsApp/Resend, partilha a pauta. O **Centro de Avaliação** tem **Imprimir** (pauta oficial via `issuePrintDocument`), WhatsApp/E-mail na barra de acções e documentos (boletim, mapa, acta, etc.) no painel Gerar.
9. Workspace do professor (`TeacherWorkspacePanel`): toolbar `InstalledModuleTools module="pedagogica"` + atalhos LMS/Zoom/Teams por turma e horário. Portal início (`TeacherPortalDashboard`): chamada rápida + QR + lançar notas da aula.
10. Árvore do sidebar (`AcademicNavTree` + `src/lib/academic-nav.ts`): Curso/Nível → turma → disciplina. Primário/iniciação = pauta da turma; secundário = disciplina do docente. Search `/pedagogica?tab=notas&turma=&disciplina=&pauta=1`. Após chamada (`AttendanceCallDialog`) o tutor tem CTA **Lançar notas** para o mesmo deep-link.
