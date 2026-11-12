# Revisão, promoção e reversão do SQL preparado

Actualizado a 08/10/2026. **Nenhum destes ficheiros foi aplicado em produção.** Seguem tabelas/colunas confirmadas no banco actual; não criam uma base alternativa nem tabelas novas. A promoção exige revisão do dono, staging e catálogo confirmado da versão a publicar.

## Alterações preparadas

1. `supabase/migrations/20261007083733_atomic_student_enrollment_and_academic_year.sql`: índice de procura de pedidos em audit_logs e quatro funções (duas privadas, dois wrappers invoker públicos). Matrícula composta com quota do plano/tenant e ano activo atómicos; permissões mínimas, âmbito/MFA e reenvio.
2. `supabase/migrations/20261007083740_staff_module_grants_require_mfa.sql`: três políticas RESTRICTIVE de escrita; não concede privilégios novos nem abre dados de alunos. SELECT existente conservado.

Ficheiros criados com `supabase migration new`. A nomenclatura é do CLI; a data de criação 07/10 não indica aplicação. Não usar migrações Lovable no SGA nem executar o conjunto indiscriminadamente.

## Validação local

`tests/sql/atomic-school-workflows.mjs` e `tests/sql/staff-grants-mfa.mjs`: PGlite 0.3.14, fixtures de colunas actuais, RPCs existentes de register/enroll e migração real duas vezes. Verificam quota, observações no histórico existente, rollback, reenvio, dados mudados, referência cruzada, AAL1/AAL2, ACL e preservação do ano. FKs/trigger/provider fora do cenário são parciais; não ensaiam concorrência PostgreSQL real.

Com dependência isolada:

```sh
SIGA_SQL_TEST_MODULE_PATH=/private/tmp/siga-remediation-20261008-pglite/node_modules/@electric-sql/pglite/dist/index.js node tests/sql/atomic-school-workflows.mjs
SIGA_SQL_TEST_MODULE_PATH=/private/tmp/siga-remediation-20261008-pglite/node_modules/@electric-sql/pglite/dist/index.js node tests/sql/staff-grants-mfa.mjs
```

O código tem contratos temporários em `src/integrations/supabase/workflow-rpcs.ts`; `types.ts` não foi editado à mão. RPCs ausentes produzem erro explícito sem escritas antigas parciais. Não publicar esse código enquanto as dependências não existirem no destino. O bypass de espera nos testes está limitado aos dois RPCs nomeados e exige migração/contrato presente; não certifica aplicação.

## Ordem para revisão e promoção

1. Confirmar staging distinto de `xodgfmxiaunpamctfeea`, schema compatível e destinos sintéticos; conservar catálogo/DDL anterior e backup conforme operação institucional.
2. Rever corpos existentes chamados, grants, policies, triggers e índices. Confirmar que não há índice equivalente de pedidos antes da promoção; o índice novo é não único, parcial e idempotente.
3. Aplicar apenas estes ficheiros aprovados ao staging; confirmar funções/ACL e políticas no catálogo. Repetir ambos no staging para verificar idempotência com triggers/FKs reais.
4. Criar duas escolas/contas e testar HTTP autenticado AAL1/AAL2, perda de resposta, último lugar de turma e activação concorrente em duas ligações PostgreSQL. Verificar quota entre todos os caminhos de cadastro; a preflight de aplicação não constitui garantia concorrente universal.
5. Executar jornada integrada da mesma versão e rever riscos pendentes. Preparar aprovação separada para produção, com tempo de aplicação, observação de locks, suporte/MFA e reversão.
6. Depois de aplicação autorizada: recapturar snapshot, regenerar tipos e retirar a extensão temporária/espera quando os tipos reais cobrirem os RPCs. Publicar só o código validado, com SHA exacto, e executar smoke seguro.

## Riscos materiais

- Índice em audit_logs pode bloquear escritas durante a criação normal; avaliar dimensão/horário em staging antes de produção. Sem ensaio de carga, não assumir duração.
- MFA recusa escrita directa de grants em sessões AAL1: validar enrolamento, desafio/recuperação e mensagens antes da promoção.
- As funções compostas dependem dos corpos e triggers actuais de cadastro/enrollment; fixture não contém toda a produção.
- Novo formulário exige requestId. Promover código/SQL como conjunto compatível e prever sessões/browser com versão anterior; não aceitar rollback para um caminho que volte a duplicar alunos.
- Quotas de planos e encerramento anual completo ainda exigem validação transversal; não foram inventadas regras institucionais.

## Reversão

Não apagar pessoas, alunos, matrículas ou audit logs concluídos. Como as funções são aditivas, uma reversão de aplicação mantém-nas e conserva as políticas mais restritivas; não é necessário desfazer dados ou baixar MFA. A aplicação anterior conserva os seus RPCs existentes.

Se houver defeito no novo fluxo, suspender a acção afectada e corrigir/republicar a função ou o código com testes; não cair automaticamente no handler antigo parcial. Uma remoção de funções/índice deve confirmar ausência de consumidores e ser um trabalho aprovado separado. Não remover a restrição MFA por conveniência de suporte nem restaurar permissões em massa. DDL anterior e metadados permitem revisão de qualquer substituição posterior; nenhuma reversão de produção foi executada nesta evolução.

## Bloqueio de publicação

`node scripts/siga/check-release-contracts.mjs` recusa a publicação enquanto os dois RPCs e as três políticas restritivas MFA não constarem do snapshot confirmado. O controlo está nos scripts de deploy e no workflow de produção; o resultado bloqueado actual é esperado. Não substitui autorização nem ensaio de staging. A matrícula serializa pedidos novos por escola e confere a quota com `tenants.max_students`/`plans.max_students`; outros caminhos de cadastro ainda precisam de ensaio concorrente transversal.
