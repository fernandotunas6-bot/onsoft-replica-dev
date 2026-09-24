# SIGA Plus — persistência académica transacional (STAGING)

**Estado:** migração e testes SQL escritos no PR #26. **Não aplicados** a staging nem produção. Não se afirma que a migração esteja validada em PostgreSQL real.

## Modelo de dados preparado
A migração scripts/siga/migrations/20260924_academic_evidence_persistence_staged.sql cria o esquema isolado academic_evidence com snapshots versionados de horários, ocorrências lectivas, planos de aula revisionados, registos de execução, sessões de avaliação e fechos de período. Todas as referências cruzadas entre tabelas de evidências usam FKs compostas (id, school_id), impedindo vínculos entre escolas diferentes.

Os horários são criados como draft; a publicação exige pelo menos uma ocorrência, fuso IANA reconhecido e correspondência de datas locais. A versão publicada fica imutável; apenas pode passar a superseded, mantendo a identidade e o registo original. Aulas de uma versão publicada não podem ser editadas ou apagadas. Uma correcção curricular exige nova revisão do plano; uma alteração de horário exige nova versão. Registos de execução só podem referenciar planos aprovados da mesma ocorrência e instituição.

As tabelas têm RLS activo e acesso directo negado a anon e authenticated; o serviço de backend usa service_role. **RLS isoladamente não substitui autenticação nem autorização de negócio:** cada operação do serviço tem de verificar identidade, associação institucional, cargo, delegação e estado do ano/período. O cliente nunca define school_id de confiança.

## Pré-requisitos de aplicação
1. Inspeccionar o DDL real de schools, academic_years, academic_schedules, class_groups, class_subjects e utilizadores; adicionar FKs institucionais para essas tabelas existentes após resolver quaisquer dados históricos inconsistentes.
2. Testar numa cópia isolada do PostgreSQL com pgcrypto, roles anon, authenticated, service_role e a configuração de fusos activa. Confirmar que a migração não interfere com outros módulos e que as permissões estão correctas.
3. Executar scripts/siga/tests/academic_evidence_staging_smoke.sql **apenas em staging**. O script usa uma transacção com ROLLBACK e verifica FK entre escolas, imutabilidade de planos e snapshots, e bloqueio de edição de aulas publicadas.
4. Acrescentar testes de concorrência de publicação, múltiplas escolas, reposições, sobreposição de docentes/salas, DST para outras regiões, aprovações simultâneas, idempotência de QR e falhas transaccionais.
5. Só então implementar endpoints transaccionais que criem snapshots a partir de horários publicados oficiais e conciliem os dados existentes. Não activar fechos ou descontos antes de haver migração de dados e revisão de RH e pedagogia.

## Limitações conhecidas desta fase
- A migração cria tabelas próprias de evidência; ainda não liga por FK às tabelas de negócio existentes, cujo DDL deve ser confirmado antes de alterar produção.
- Os identificadores do professor, da turma e da disciplina estão tipados como UUID, mas o serviço tem de verificar que pertencem à mesma escola e ao mesmo ano.
- O esquema guarda uma aprovação de execução por ocorrência. Fluxos de contestação, substituição e múltiplas revisões de execução exigem histórico de eventos adicional, sem sobrescrever a evidência anterior.
- O controlo de conflitos entre provas e aulas existe na lógica TypeScript; falta uma transacção única que o revalide imediatamente antes de publicar.
- O fecho de período só poderá ser gravado por uma função de backend que recompute o roster e os bloqueios na mesma transacção. Os campos de aprovação não devem ser aceites directamente de formulários.

## Refinamento de integridade (24-09-2026)

- Corrigidos três delimitadores PL/pgSQL malformados na migração preparada. A verificação estática não substitui a execução real do SQL.
- Uma reposição de aula exige agora referência composta (id, school_id) e validação adicional de que a aula original pertence à **mesma versão** do horário. Não é permitido transformar uma ocorrência existente noutra escola, noutra versão ou noutro identificador.
- O teste de preparação passou a tentar uma reposição entre escolas e uma alteração da escola de uma aula. Ambas devem ser rejeitadas, com rollback de todos os dados do ensaio.
- **Atenção:** o script de preparação ainda não foi executado em PostgreSQL; executar migração e teste SQL num ambiente isolado antes de aprovar o PR ou activar a persistência.
