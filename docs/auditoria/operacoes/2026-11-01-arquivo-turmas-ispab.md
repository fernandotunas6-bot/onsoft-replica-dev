# Arquivo das turmas vazias e «DEMO» do ISPAB — 01/11/2026

Autorizado pelo proprietário a 01/11/2026. Escola: ISPAB (tenant `minha-escola`).
Executado às 17:19:45 UTC no Supabase `Sga`, numa só instrução `UPDATE … RETURNING`.

## Critério (o mesmo da aplicação)

`status = 'archived'` — como `archiveClassGroup` em `src/features/academic/server-legacy.ts`.
Nunca turmas com matrículas `active` ou `pending` (regra da aplicação).

- **219 turmas** activas sem matrículas, pautas, folhas de notas, presenças, horários
  (tempos ou horários publicados), tarefas, inscrições em unidades curriculares, lista de
  espera, aulas virtuais, eventos ou avisos. Criadas pelo modelo de estrutura a 22/10.
- **11 turmas «DEMO —»** em rascunho, sem matrículas activas.

Não arquivada: **«DEMO — 1.ª Classe B»**, que tem 15 matrículas activas de alunos fictícios
(«Aluno …»). Para a arquivar é preciso anular primeiro essas matrículas — decisão à parte.

## Resultado verificado

| Antes                     | Depois                     |
| ------------------------- | -------------------------- |
| 235 turmas não arquivadas | 5 (4 activas + 1 rascunho) |
| 72 matrículas activas     | 72 (inalteradas)           |

O gatilho `audit_class_groups_change` registou as 230 alterações em `audit_logs`
(`class_groups.update`, 17:19:45 UTC). O gatilho `class_groups_track_teacher_periods`
fechou os períodos docentes destas turmas, se os houvesse.

## Reverter

```sql
with s as (
  select s.id from schools s join tenants t on t.id = s.tenant_id where t.slug = 'minha-escola'
), alvo as (
  select a.entity_id::uuid id from audit_logs a
  where a.school_id = (select id from s)
    and a.action = 'class_groups.update'
    and a.occurred_at between '2026-11-01 17:19:40+00' and '2026-11-01 17:19:55+00'
)
update class_groups cg
set status = case when cg.name like 'DEMO —%' then 'draft' else 'active' end
from alvo
where cg.id = alvo.id and cg.status = 'archived';
-- Esperado: 230 linhas.
```

## Tenant que falhou na criação

`siga-plus-web-production-falhou-986ba240` (id `986ba240-1c93-4228-a8b9-f0862e9cb551`): **arquivado**,
não apagado, às 17:2x UTC — `status` `provisioning_failed` → `archived`, `subscription_status`
`trialing` → `canceled`. A escola associada («SIGA Plus - Web Production») já estava `archived`.

Não foi apagado porque 553 linhas de `audit_logs` referem a escola (`audit_logs_school_id_fkey`,
sem cascata) e `audit_logs_immutable` impede apagar auditoria: apagar a escola exigiria destruir
o histórico. Sem domínios, subscrições, contas nem dados escolares. Reverter:

```sql
update tenants set status = 'provisioning_failed', subscription_status = 'trialing'
where id = '986ba240-1c93-4228-a8b9-f0862e9cb551';
```
