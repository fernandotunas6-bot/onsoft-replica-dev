---
name: siga-pessoas
description: >-
  Extends SIGA people registry and teacher profiles. Use when editing
  /pessoas, /professores, listTeachers, mergePeople, or src/features/people.
---

# SIGA · Pessoas e professores

- Rotas: `src/routes/pessoas/index.tsx`, `src/routes/professores/$teacherId.tsx`
- Domínio: `src/features/people/{schemas,server}.ts`
- Workspace docente: `src/features/academic/TeacherWorkspacePanel.tsx`
- Testes: `tests/people/schemas.test.ts`, `tests/people/angola-identity-edit-contract.test.ts`
- `/professores` é permitido a Professor; `/pessoas` e `/alunos` não.

## Regras

1. Uma pessoa, vários papéis (`person_roles`). Não duplicar ficha.
2. Ficha do professor mostra turmas via `getTeacherWorkspace` (`user_id`, depois email/nome). Convite em Acessos chama `ensureTeacherHrRecord`. Secretaria/Admin: **Editar**, **Atribuir disciplina** e **Desligar** (`unassignClassSubjectTeacher`). No registo central, a ficha da pessoa tem **Editar** (`updatePerson`, inclui NIF/BI com `AngolaIdentityField`), **Foto da biblioteca** (`setPersonPhotoUrl` / `applyLibraryPhotoToPerson`) e **Adicionar documento** (`addPersonDocument` → `person_documents`, com anexo opcional `file_id`/`file_name` da biblioteca; BI sincroniza `national_id`). Nova pessoa e formulário público `/matricula/$slug` usam o mesmo campo. **Todos** os pontos de edição de BI/NIF (QuickForm em `/pessoas`, `PersonProfile360Modal`, wizard, matrícula) usam `AngolaIdentityField` — nunca um `<Input>` simples para esse campo. Lista de professores e **Registo central** têm CSV/PDF/**Oficial**. Ficha do professor e `/acessos` imprimem **Credenciais**. Com `whatsapp.notices`, o telefone abre WhatsApp; com `resend.send`, emails copiam texto para Resend (lista, ficha e registo central).
3. Merge: `mergePeople` recusa dois alunos ou dois professores.
