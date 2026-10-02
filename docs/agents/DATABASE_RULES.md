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

6a. **Permissão não é âmbito.** Os papéis `student` e `guardian` têm permissões de leitura
   (`students.records.read`, `finance.invoices.read`, `assessment.grades.read`…) que as
   políticas `*_select_authorized` não limitam ao próprio aluno. Tabela nova com dados de
   alunos, notas, faltas, pagamentos ou documentos → acrescentá-la à lista de
   `20260930130000_sensitive_tables_school_staff_only.sql` (política RESTRICTIVE
   `private.is_school_staff(school_id)`) e o teste `staff-only-sensitive-tables` exige-o.
6b. **Função `public.*` INVOKER que chama `private.*`:** `authenticated` precisa de EXECUTE
   em toda a árvore privada que ela percorre (`CREATE OR REPLACE` mantém as permissões
   antigas). Sem isso a função responde sempre «permission denied for function».

6c. **Escrita pela API exige 2FA.** Política de INSERT/UPDATE/DELETE para `authenticated`
   leva `private.is_aal2()` e a permissão da acção. Uma permissiva sem `is_aal2` ao lado
   de outra que o exige anula o 2FA (somam-se por OR); o teste `staff-only-sensitive-tables`
   recusa-a. `students` e `enrollments` não aceitam INSERT directo: só pelo servidor.

## `CREATE TABLE IF NOT EXISTS` não corrige uma tabela que já existe

Se a tabela existe com outra forma, `CREATE TABLE IF NOT EXISTS` não faz nada **e não dá
erro**. Quem aplica vê sucesso e conclui que ficou feito.

Aconteceu com `school_access_requests`: uma versão foi aplicada à mão a 2026-09-25, a
migração `20260925090000_school_access_requests.sql` foi depois reescrita com outros nomes
(`institutional_number` por `institutional_id`, `requested_profile` por `requested_role`, e
sete colunas novas), correu, e a tabela ficou como estava. O pedido de acesso a uma escola
nunca gravou. O rasto visível eram seis índices onde deviam estar três — os da versão nova
criaram-se, porque só tocam colunas que as duas versões partilham.

Pior: o repositório tinha **duas** declarações da mesma tabela, com formas diferentes e ambas
com `IF NOT EXISTS` — a migração acima e a captura
`20260925120220_capture_undeclared_production_tables.sql`, esta com carimbo mais recente e a
forma antiga. Qualquer uma que corra primeiro ganha.

Regras que saem disto:

- **Alterar uma tabela que já existe faz-se com `ALTER TABLE`**, não reescrevendo o
  `CREATE TABLE`. Ver `20260927100000_reconcile_school_access_requests.sql` como modelo:
  renomear preserva tipo, `NOT NULL` e chaves estrangeiras; `ADD COLUMN IF NOT EXISTS`
  acrescenta; as restrições de valor largam-se antes de traduzir os valores e põem-se depois.
- **Uma tabela, uma declaração.** Se a captura do catálogo já declara a tabela, a migração de
  funcionalidade não a volta a declarar — altera-a.
- **Confirmar no retrato as COLUNAS, não só a tabela.** `supabase/PRODUCTION_SNAPSHOT.json`
  lista as colunas de cada tabela. A regra 1 diz «tabela e coluna»; é esta a razão.
- Depois de aplicar, recapturar (`npm run siga:db-snapshot`) e comparar. Se o retrato não
  mudou, a migração não correu — foi assim que se soube, a 2026-09-26, que nada posterior a
  25/09 11:50 tinha sido aplicado.

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

`src/integrations/supabase/types.ts` descreve a base de **produção do SIGA** (164 tabelas a
2026-09-26, igual a `supabase/PRODUCTION_SNAPSHOT.json`). Em 2026-09-26 o Lovable regenerou-o a partir
de outra base (86 tabelas, com `invoices`, `payments`, `courses`, que não existem no SIGA) e
o código deixou de compilar. `tests/security/types-match-production.test.ts` falha nesse
caso. **Não aceitar um types.ts que apague tabelas da produção:** repor a versão anterior.

Não o editar à mão nem corrigir o número acima quando ele divergir: `npm run siga:gen-types`
gera-o a partir do projecto ligado e carimba-o, e `npm run siga:db-snapshot` recaptura o
retrato. Os dois têm de contar as mesmas tabelas — foi assim que se soube, a 2026-09-26, que
nenhuma das migrações posteriores a 25/09 11:50 tinha corrido: o retrato recapturado saiu
idêntico ao anterior, byte por byte, tirando a data.
