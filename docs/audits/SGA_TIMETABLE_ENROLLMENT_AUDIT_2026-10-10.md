# Auditoria SGA — matrícula e horários (2026-10-10)

**Projeto Supabase:** `xodgfmxiaunpamctfeea` (produção, ligado ao Lovable) · **Commit de referência:** `ebaf208`
**Atualiza:** `SGA_SECURITY_SCHEDULE_AUDIT_2026-09-24.md` (ver secção "Correções à auditoria anterior").

## Estado

- Código e migração corrigidos no repositório. **Nada aplicado em produção.**
- Migração: `scripts/siga/migrations/20261010_timetable_guard_alignment.sql` (STAGED).
- Validação: reprodução local em Postgres 16 com tabelas mínimas; testes estáticos em `scripts/siga/timetable-guard-alignment-static.test.mjs`.
- Pendente: teste em staging com duas sessões (conflitos concorrentes) e testes de navegador.

## Achados e estado

| # | Severidade | Achado | Estado |
|---|---|---|---|
| 1 | Alta | Trigger `guard_timetable_slot_conflicts` comparava salas como texto. Duas aulas sobrepostas sem sala fixa (rótulo "Sala", por defeito no servidor) eram rejeitadas como "sala ocupada". Também tratava `Lab 1` e `lab 1` como salas diferentes. | Corrigido na migração (mesma regra de `timetable_room_is_explicit`). Reproduzido e validado localmente. |
| 2 | Média | `create_timetable_slot_guarded` / `update_timetable_slot_guarded` tinham EXECUTE para `authenticated`. Um utilizador podia chamá-las via PostgREST, contornar as verificações de papel da aplicação e gravar `created_by`/`updated_by` com outro utilizador (`p_actor` vem do cliente). A aplicação usa o cliente de serviço, por isso só `service_role` precisa de EXECUTE. | Corrigido na migração (REVOKE/GRANT). Validado localmente. |
| 3 | Média (decisão pendente) | Política `timetable_slots_read`: membros que não são docentes leem todos os slots da escola (55 vínculos ativos não-docentes). | **Não alterado.** Confirmar se o horário completo deve ser visível a todos os membros. |
| 4 | Baixa | `private.enforce_timetable_slot_no_overlap()` tinha EXECUTE para `anon`/`authenticated`. | Corrigido na migração. |

## Correções à auditoria de 24/09

- **Existe** restrição contra sobreposições: trigger `timetable_slot_no_overlap` (com advisory lock por escola e dia). A auditoria dizia que não havia.
- Há **dois** triggers de sobreposição com regras diferentes. O mais restritivo decide, e foi daí que veio o achado 1. Sugestão: manter só o `timetable_slot_no_overlap` depois de validar em staging.
- As políticas legadas `can_manage_students` em `class_groups` já não existem na base de produção.
- O cliente de serviço (`loadSgaAdminClient`) contorna RLS. Nas RPCs de horário, a proteção depende da verificação de papel da aplicação (`requireSgaWriterForWrite`) e dos triggers.

## Matrícula (sem alterações)

- `private.enroll_student` e `private.enroll_new_student_atomic`: AAL2, permissão, bloqueio `FOR UPDATE` da turma, capacidade, ano lectivo, uma matrícula atual por ano (índice único parcial) e idempotência por `request_id`. Sem problemas encontrados.

## Testes de staging a executar antes de aplicar

1. Duas aulas sobrepostas, turmas diferentes, sem sala: ambas aceites.
2. Mesma sala fixa (`room_id` ou rótulo `Lab 1` / `lab 1`) sobreposta: rejeitada.
3. Fronteiras adjacentes (08:00–09:00 e 09:00–10:00): aceites.
4. Chamada direta a `create_timetable_slot_guarded` com token de `authenticated`: deve falhar com "permission denied".
5. Criação simultânea de duas aulas em conflito real (duas sessões): apenas uma passa.
6. Advisors de segurança e performance após aplicar.
