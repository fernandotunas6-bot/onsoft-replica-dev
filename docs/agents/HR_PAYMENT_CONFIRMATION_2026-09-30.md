# Confirmação salarial transaccional

A confirmação salarial criava a saída de caixa, actualizava o item e sincronizava lote/folha em pedidos separados. Uma falha intermediária deixava o agregado incompleto; confirmações concorrentes podiam disputar o lançamento de caixa.

`hr_confirm_payroll_payment_item` confirma a operação numa transacção. O helper privado exige identidade, vínculo/papel da escola, MFA, permissão financeira e grant de escrita. Respeita `allow_manual_confirmation`, valida beneficiário/valor contra a folha aprovada e exige ordem autorizada. Bloqueia lote e registos salariais antes de gravar. Reenvio de pagamento com a mesma referência devolve o resultado; outra referência ou resultado é recusado. Falha de pagamento não cria saída de caixa. Competência só fica paga depois de todos os seus itens não cancelados estarem pagos.

O servidor usa a RPC com o JWT do utilizador. O wrapper público é INVOKER; o helper privilegiado é privado, com search_path vazio e EXECUTE revogado a PUBLIC/anon. Nenhuma permissão de tabela foi ampliada.

Estados Zod alinhados com os CHECKs da produção: awaiting_authorization/failed nos lotes, processing nos itens salariais. Removido ready, que não existe na tabela.

Validação: 35 testes Vitest, typecheck e lint dos ficheiros alterados aprovados; teste SQL PGlite verifica rollback injectado após lançamento de caixa, MFA, escola, grants, política manual, valor divergente, falhas, reenvios e conclusão. Migração aplicada duas vezes no ensaio local; aplicada em SGA via MCP e permissões verificadas no catálogo. Chamada sem identidade recusada em transacção READ ONLY na produção. Sem pagamentos de teste na produção. Advisors sem novo achado relativo à função.

Limites: o fixture omite FKs de entidades alheias ao cenário; concorrência real PostgreSQL e aceitação de utilizadores requerem ensaio separado. Não executa transferência bancária. A migração é aditiva e compatível com servidor anterior; este apenas passa a usar a confirmação atómica após publicação. O deploy continua dependente dos secrets de production.

## Continuação — destino salarial (01/10/2026)

A alteração do destino bancário passou a uma RPC transaccional, com guarda de papel/escola/permissão/MFA e bloqueio do vínculo que serializa a primeira criação. Destino e auditoria são guardados juntos; falha da auditoria reverte o destino. Reenvio sem alteração devolve unchanged e não duplica eventos. A auditoria mantém o evento hr.payment_destination.changed com actor, vínculo e valores antes/depois mascarados.

As referências e números de conta curtos deixam de aparecer completos nas listagens/auditoria. IBAN/conta/referência mostram apenas os últimos quatro caracteres quando o valor tem mais de quatro caracteres. A validação aceita os métodos existentes e exige dados de destino para transferências; não certifica IBAN nem executa transferência bancária.

Validação desta continuação: 36 testes Vitest; ensaio SQL PGlite com falha de auditoria injectada na criação e actualização, máscaras, reenvio, isolamento/MFA/grants e permissões. Concorrência PostgreSQL real permanece por ensaiar. Nenhum destino de teste criado na produção.

Migração do destino aplicada no SGA em 01/10/2026. Chamada sem identidade recusada em READ ONLY; permissões do wrapper/helper verificadas e helper de máscara não executável por authenticated. Types e lint aprovados. Deploy não executado.
