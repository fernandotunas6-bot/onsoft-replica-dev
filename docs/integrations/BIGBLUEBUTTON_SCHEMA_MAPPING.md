# BigBlueButton — mapeamento do esquema real SIGA

Inspecção read-only em 08/10/2026 do projecto Supabase associado ao SIGA Plus.

| Recurso | Tabela existente | Identificadores relevantes |
| --- | --- | --- |
| Escolas e vínculos | `school_memberships` | `school_id`, `user_id`, `status` |
| Funções institucionais | `member_roles`, `roles` | `membership_id`, `role_id`, `code` |
| Professores | `teachers` | `school_id`, `id`, `user_id`, `person_id` |
| Turmas | `class_groups` | `school_id`, `id`, `academic_year_id` |
| Atribuições | `class_subjects` | `school_id`, `class_group_id`, `teacher_id` |
| Alunos | `students` | `school_id`, `id`, `person_id` |
| Matrículas | `enrollments` | `school_id`, `student_id`, `class_group_id`, `status` |

## Regra de autorização

O servidor deve validar `auth.uid()` contra `school_memberships.user_id` com vínculo activo e `school_id` correspondente. Para professor, ligar `teachers.user_id` ao utilizador e `class_subjects.teacher_id` a `teachers.id`, sempre na mesma escola. Para aluno, **não assumir** que `students.id = auth.uid()`: descobrir e verificar a ligação institucional real entre pessoa/aluno e utilizador antes de permitir entrada. Confirmar matrícula activa na turma.

O componente `VirtualClassroomControls` é exclusivamente de interface; as capacidades recebidas são indicadores visuais e **nunca substituem** as verificações no servidor.

## Bloqueios para integração funcional

- Identificar ligação autenticada utilizador ↔ aluno (não inferir por UUID).
- Inspeccionar padrões de server functions e de rotas do TanStack Start antes de criar endpoints.
- Implementar migração com RLS e testes em ambiente de homologação.
- Provisionar BBB e configurar segredos exclusivamente no servidor.
- Executar testes de integração, segurança e carga antes do deploy.
