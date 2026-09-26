# Regras de base de dados — para qualquer agente (Lovable, Claude, Codex)

O Lovable está ligado à base de **produção** (`xodgfmxiaunpamctfeea`). Uma migração
aprovada no chat do Lovable corre logo nas escolas reais. Estas regras existem porque a
2026-09-25 três migrações novas abriam dados de menores e de pagamentos a qualquer
aluno, e duas nem chegavam a correr na base SGA (função e colunas inexistentes).

## Antes de escrever SQL

1. **Confirmar que cada tabela e coluna existe** em `supabase/PRODUCTION_SNAPSHOT.json`.
   O esquema antigo do Lovable (`drizzle/`) não é o da produção: por exemplo,
   `subjects.grade_from`, `grade_levels.sort_order` e `students.registration_number` não
   existem.
2. **Funções de trigger:** usar `public.siga_touch_updated_at()`. `public.set_updated_at()`
   não existe na base SGA.
3. **Idempotência obrigatória:** `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`,
   `DROP POLICY IF EXISTS` antes de `CREATE POLICY` e `DROP TRIGGER IF EXISTS` antes de
   `CREATE TRIGGER`. A migração tem de poder correr duas vezes sem erro.

## Acesso aos dados (RLS)

4. **`public.is_school_member(school_id)` é verdadeiro para alunos e encarregados.** Nunca o
   usar sozinho numa política de escrita (`FOR ALL`, `INSERT`, `UPDATE`, `DELETE`), nem de
   leitura em dados de alunos, notas, risco, saúde, pagamentos, salários ou pessoal.
5. **Tabelas sensíveis ficam só com o servidor**, que já valida o papel com
   `requireSgaWriter` e usa a chave de serviço:

   ```sql
   ALTER TABLE public.x ENABLE ROW LEVEL SECURITY;
   ALTER TABLE public.x FORCE ROW LEVEL SECURITY;
   REVOKE ALL ON public.x FROM PUBLIC, anon, authenticated;
   GRANT ALL ON public.x TO service_role;
   ```

   Sem políticas, anon e authenticated ficam sem acesso nenhum. Exemplos:
   `school_access_requests`, `student_risk_cases`, `payment_gateway_charges`,
   `siga_lesson_plans`.
6. Se o browser precisar mesmo de ler directamente, usar permissões por papel
   (`private.has_permission(school_id, '<permissão>')` ou `public.current_school_role_is(...)`),
   nunca apenas "é membro".

## Processo

7. **Nunca aprovar no Lovable uma migração que falhe estas regras.** Em dúvida, rejeitar e
   pedir revisão.
8. Novas tabelas usadas pelo código entram em `TABELAS_AUSENTES_DA_PRODUCAO`
   (`tests/security/production-snapshot.test.ts`) até serem aplicadas, e saem de lá depois
   de o retrato ser recapturado.
9. `tests/security/server-only-sensitive-tables.test.ts` protege as tabelas sensíveis.
   Tabela sensível nova → acrescentá-la a esse teste.
10. `drizzle/` é a base própria do Lovable. Não aplicar essas migrações à base SGA (ver
    `AGENTS.md`).

## Texto para colar em Lovable → Project settings → Knowledge

```
Base de dados = PRODUÇÃO das escolas. Regras obrigatórias para qualquer migração:
- Confirmar tabelas/colunas em supabase/PRODUCTION_SNAPSHOT.json antes de as usar.
- Triggers usam public.siga_touch_updated_at(); set_updated_at() não existe.
- Tudo idempotente: IF NOT EXISTS; DROP POLICY/TRIGGER IF EXISTS antes de CREATE.
- is_school_member inclui alunos e encarregados: nunca o usar em políticas de escrita
  nem em dados de alunos, notas, risco, pagamentos ou pessoal.
- Tabelas sensíveis: FORCE ROW LEVEL SECURITY + REVOKE ALL FROM PUBLIC, anon,
  authenticated + GRANT ALL TO service_role, sem políticas. O acesso é feito pelo
  servidor com requireSgaWriter.
- Ler docs/agents/DATABASE_RULES.md antes de criar SQL.
```

## `types.ts` gerado da base errada

`src/integrations/supabase/types.ts` descreve a base de **produção do SIGA** (156 tabelas,
igual a `supabase/PRODUCTION_SNAPSHOT.json`). Em 2026-09-26 o Lovable regenerou-o a partir
de outra base (86 tabelas, com `invoices`, `payments`, `courses`, que não existem no SIGA) e
o código deixou de compilar. `tests/security/types-match-production.test.ts` falha nesse
caso. **Não aceitar um types.ts que apague tabelas da produção:** repor a versão anterior.
