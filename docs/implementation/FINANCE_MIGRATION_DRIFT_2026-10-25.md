# SIGA Plus — reconciliação financeira e migrações fora do histórico

**Data da auditoria:** 25/10/2026. **Projecto:** SIGA Plus. **Fonte:** catálogo de PostgreSQL/Supabase consultado em modo só de leitura e PRs #276 e #283. Este documento **não** autoriza migrações, merges ou deploy.

## Factos confirmados no projecto de produção

| Verificação | Observado | Consequência |
| --- | --- | --- |
| `public.finance_cash_points` | Existe; RLS activo | Caixa já tem parte do esquema em produção |
| `public.finance_cash_sessions` | Existe; RLS activo | Não tentar recriar cegamente a tabela |
| Gatilhos de recibos/despesas do caixa | Existem | O comportamento de escrita já pode ser afectado por triggers |
| EXECUTE anónimo nas RPC de caixa | Não concedido | Protecção observada; não comprova autorização end-to-end |
| SELECT directo de anon/authenticated no caixa | Não concedido | Leitura apenas pelo servidor com guardas de escola |
| Quatro triggers de caixa (movimento e estorno) | Presentes | Confirma nomes, não equivale a uma comparação de corpos SQL |
| RPC públicas de caixa exigidas | Conjunto presente | As assinaturas e a lógica de autorização devem ser ensaiadas em staging |
| Histórico `20261024110000` | Ausente em `supabase_migrations.schema_migrations` | **Drift**: objectos presentes e versão não registada |
| `finance_receipts.idempotency_key` | Ausente | Migração #276 de idempotência não reflectida |
| Índice `finance_receipts_school_idempotency_key` | Ausente | Necessário antes de adoptar o novo contrato de pagamentos |
| RPC `public.register_payment` de 6 parâmetros | Ausente | Interface nova da #276 não pode ser presumida em produção |
| Cálculo de estorno com `penalty_amount` | Ausente no corpo actualmente instalado | Possível estado incorrecto após estorno de factura com multa |

A verificação não consulta notas, alunos, credenciais, facturas individuais ou saldos reais. A observação sobre o estorno decorre da definição da função (não de uma transacção financeira testada). A presença de nomes de funções não prova identidade integral com os ficheiros SQL da PR.

## Verificador repetível sem modificação da BD

Executar num terminal **privado**, nunca em frontend, com um token de gestão Supabase autorizado para **leitura do catálogo**. O token não é guardado no repositório:

```sh
node scripts/siga/check-finance-schema-drift.mjs --project-ref=<REF_DO_PROJECTO>
```

Definir previamente `SUPABASE_ACCESS_TOKEN` como variável de ambiente apenas no processo seguro. A script usa **SQL de SELECT constante** através do endpoint dedicado **`POST /v1/projects/{ref}/database/query/read-only`**, que executa a consulta como `supabase_read_only_user` (Beta). **Não** usa `POST /database/query` nem depende da opção `read_only` nesse endpoint de escrita. Não aceita texto SQL arbitrário e falha com código diferente de zero se encontrar drift, pendências ou resposta malformada. A API requer monitorização de alterações do fornecedor.

Uma saída sem divergência **não** prova que o sistema está pronto: o teste cobre 19 indicadores de inventário (incluindo RLS, privilégios directos de leitura, EXECUTE anónimo em RPCs e os quatro gatilhos de movimentos/estorno), não o DDL integral, os constrangimentos, a semântica das RPCs, as permissões por escola nem a funcionalidade autenticada.

## Segunda sondagem estrutural — 25/10 (consulta SELECT)

Comparei os **nomes declarados** por `supabase/migrations/20261024110000_finance_cash_sessions.sql` (#283) com `information_schema` e `pg_catalog` da produção, sem consultar linhas financeiras nem executar SQL de escrita:

| Grupo | Encontrados / esperados | Abrangência |
| --- | --- | --- |
| Colunas | **12/12** | Estrutura-base de postos e sessões; vínculos dos recibos e despesas às sessões |
| Índices | **7/7** | Posto activo único, sessão aberta única, ordenação e movimentos de caixa |
| Restrições nomeadas | **3/3** | Fecho completo, justificação de diferença e separação entre fecho/aprovação |
| Funções | **13/13** | Nove funções `private` e quatro `public` da migração |
| Gatilhos | **4/4** | Ligação e estorno dos recibos e das despesas de caixa |

**Limite da evidência:** foi verificada a **existência dos nomes**, não a igualdade de corpos das funções, definições dos índices, políticas, permissões, defaults, tipos precisos das colunas ou histórico de execução. Objectos podem ter sido criados manualmente ou alterados posteriormente. O problema da versão `20261024110000` ausente mantém-se, e **não autoriza** `migration repair` nem reaplicação automática. O próximo passo é comparar DDL completo e ensaiar regressões de caixa em staging.

## Ordem segura de resolução

1. **Congelar mutações de migrações financeiras em produção.** Não executar novamente `20261024110000` nem alterar manualmente `supabase_migrations.schema_migrations`.
2. Capturar diferenças de `pg_get_functiondef`, `pg_get_triggerdef`, colunas, índices, `GRANT`/`REVOKE`, RLS e dependências. Comparar com as migrações versionadas #276 (reversão e idempotência) e #283 (sessões de caixa). Confirmar se todos os efeitos laterais da migração #283 estão presentes.
3. Provisionar **staging Supabase independente**, aplicar migrações na sequência canónica, incluindo as bases de #276 antes dos ensaios de #283. Não usar dados nem segredos reais.
4. Validar AAL2, administrador/tesouraria, dois tenants, fechar/aprovar por pessoas distintas, concorrência em caixa, estorno com multa, duplicação de pagamento, timeout, replay com chave e integrações de gateway. Testar as RPC directamente além da interface.
5. Apenas com prova de equivalência, rever a documentação oficial do Supabase sobre `migration list` e `migration repair`; esta última ferramenta **muda o histórico** e, por isso, requer aprovação e plano de rollback específicos. Não marcar como aplicada uma migração cujo SQL real não foi inteiramente auditado.
6. Gerar tipos e snapshot a partir do ambiente correcto, rever diffs e conciliar os três testes de segurança que dependem desses ficheiros. Preparar release reversível e aprovação explícita antes da publicação.

## Estado das PRs e coordenação dos agentes

- **#276:** CI, académicos e Lighthouse mobile passaram no último SHA observado `6a607e0`; idempotência/estorno ainda não estão reflectidos na produção.
- **#283:** CI e académico passaram no SHA `1f089216` após correcções de TypeScript e Prettier; base **#276**, não `main`. Alguns objectos desta PR já existem na base real.
- **#275 → #277:** segurança de publicação do website, seguida do Puck Studio; ambas abertas, rascunho.
- **#287:** política de senhas aberta, CI aprovado.
- **#288:** desktop Tauri integrado na `main` (incremental; não significa offline integral).
- **#291:** portão E2E/staging + este inventário; CI e testes locais anteriores aprovados; novo CI deve ser validado no último commit antes de integração.

**Fonte normativa:** [Supabase — migrations](https://supabase.com/docs/guides/deployment/database-migrations) e [Management API — consulta exclusiva de leitura](https://supabase.com/docs/reference/api/v1-read-only-query). A decisão de reparar histórico nunca deve ser automática.
