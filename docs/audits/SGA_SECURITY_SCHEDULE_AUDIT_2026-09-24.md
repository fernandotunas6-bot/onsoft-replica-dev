# Auditoria SGA — segurança, vínculos e horários (2026-09-24)

**Projeto Supabase:** `xodgfmxiaunpamctfeea` · **Estado:** auditoria de leitura, sem migrações executadas.  
**Compatibilidade:** respeitar `supabase/DO_NOT_APPLY_TO_SGA.txt`; nunca aplicar `all_migrations_combined.sql` ao SGA.

## Evidência recolhida no banco ativo

- 157 tabelas em `public`, todas com RLS habilitado. RLS habilitado **não** significa autorização correta.
- Quatro verificações de integridade deram zero ocorrências: vínculos ativos duplicados; `students.person_id` de escola diferente; `teachers.person_id` de escola diferente; `class_subjects.class_group_id` de escola diferente.
- `school_memberships` já possui `UNIQUE (school_id,user_id)`.
- Em `people`, `students` e `class_groups` coexistem políticas legadas baseadas em `can_manage_students()` e políticas granulares `private.has_permission(...)` com `private.is_aal2()`. Como políticas permissivas se combinam com OR, a política legada pode permitir escrita sem AAL2; verificar todos os fluxos antes de removê-la.
- Advisor de segurança: 22 tabelas com RLS sem política (incluindo 19 públicas), uma função `SECURITY DEFINER` acessível a `anon` (`validate_issued_document`), 22 avisos de funções `SECURITY DEFINER` acessíveis a `authenticated`, proteção de palavras-passe comprometidas desativada. Avisos sobre funções **não** comprovam exploração; verificar finalidade e autorização antes de revogar.
- `timetable_slots` possui `CHECK (ends_at > starts_at)`, mas nenhuma restrição de exclusão contra sobreposições apareceu na lista de constraints; a UI possui `detectScheduleConflicts` em `src/features/academic/schedule/utils/conflicts.ts`. A verificação no cliente não protege gravações concorrentes ou APIs externas.

## Sequência de correção — aplicar apenas após testes

1. Inventariar políticas de cada tabela, os privilégios e os chamadores RPC do frontend. Reproduzir testes de acesso por escola, papel e AAL1/AAL2 com usuários de teste. Só então substituir políticas legadas por políticas granulares equivalentes; não eliminar acesso de professores aos próprios alunos.
2. Inspecionar `pg_get_functiondef('public.validate_issued_document(text)'::regprocedure)` e os campos retornados. A validação pública de documentos pode ser intencional; garantir token não enumerável, resposta mínima e ausência de dados pessoais indevidos.
3. Inspecionar as demais funções `SECURITY DEFINER`, `search_path`, `EXECUTE` e verificações internas de `auth.uid()`, `school_id` e permissões; não revogar em massa.
4. Habilitar proteção contra palavras-passe comprometidas no painel Supabase Auth após verificar compatibilidade e comunicação aos utilizadores.
5. Para horários, validar no servidor a sobreposição de turma, professor e sala por escola, dia e intervalos semiabertos `[starts_at, ends_at)`; ignorar slots cancelados/arquivados e tratar versões de horários publicados. Serializar gravações concorrentes por escola e recurso (ou adotar restrições de exclusão adequadas). Validar `room_id`, `shift_id`, `schedule_id`, `teacher_id` e o mesmo `school_id` em todas as referências.
6. Testar criação simultânea de slots, fronteiras adjacentes (10:00–11:00 e 11:00–12:00), conflito real, alteração de professor, publicação de versão e autorização de usuário de outra escola. Reexecutar os advisors após cada migração.

## Consultas de verificação (somente leitura)

```sql
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('people','students','class_groups','timetable_slots')
order by tablename, policyname;

select pg_get_functiondef('public.validate_issued_document(text)'::regprocedure);

select conrelid::regclass, conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid in ('public.timetable_slots'::regclass,
                   'public.school_memberships'::regclass);
```

**Critério de conclusão:** testes de acesso cruzado negativos; operações legítimas preservadas; conflitos concorrentes rejeitados no banco/serviço; advisors revistos; migração específica SGA versionada no repositório e testada em staging antes de produção.
