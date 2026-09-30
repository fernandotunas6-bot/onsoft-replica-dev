# Confirmação salarial transaccional

A confirmação salarial criava a saída de caixa, actualizava o item e sincronizava lote/folha em pedidos separados. Uma falha intermediária deixava o agregado incompleto; confirmações concorrentes podiam disputar o lançamento de caixa.

`hr_confirm_payroll_payment_item` confirma a operação numa transacção. O helper privado exige identidade, vínculo/papel da escola, MFA, permissão financeira e grant de escrita. Respeita `allow_manual_confirmation`, valida beneficiário/valor contra a folha aprovada e exige ordem autorizada. Bloqueia lote e registos salariais antes de gravar. Reenvio de pagamento com a mesma referência devolve o resultado; outra referência ou resultado é recusado. Falha de pagamento não cria saída de caixa. Competência só fica paga depois de todos os seus itens não cancelados estarem pagos.

O servidor usa a RPC com o JWT do utilizador. O wrapper público é INVOKER; o helper privilegiado é privado, com search_path vazio e EXECUTE revogado a PUBLIC/anon. Nenhuma permissão de tabela foi ampliada.

Estados Zod alinhados com os CHECKs da produção: awaiting_authorization/failed nos lotes, processing nos itens salariais. Removido ready, que não existe na tabela.

Validação: 35 testes Vitest, typecheck e lint dos ficheiros alterados aprovados; teste SQL PGlite verifica rollback injectado após lançamento de caixa, MFA, escola, grants, política manual, valor divergente, falhas, reenvios e conclusão. Migração aplicada duas vezes no ensaio local; aplicada em SGA via MCP e permissões verificadas no catálogo. Chamada sem identidade recusada em transacção READ ONLY na produção. Sem pagamentos de teste na produção. Advisors sem novo achado relativo à função.

Limites: o fixture omite FKs de entidades alheias ao cenário; concorrência real PostgreSQL e aceitação de utilizadores requerem ensaio separado. Não executa transferência bancária. A migração é aditiva e compatível com servidor anterior; este apenas passa a usar a confirmação atómica após publicação. O deploy continua dependente dos secrets de production.
