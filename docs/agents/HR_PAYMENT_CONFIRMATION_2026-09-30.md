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

## Continuação — datas e horas de aulas (01/10/2026)

A sincronização do horário aceitava dias inexistentes porque Date.parse normaliza, por exemplo, 30 de Fevereiro para Março. A criação de aulas extra apenas verificava o formato textual e aceitava horas fora de 00:00–23:59. Os schemas centrais passam a verificar o dia real do calendário (incluindo anos bissextos e excluindo o ano zero) e os limites de horas/minutos antes das RPCs. Mantêm o limite de 31 dias entre as extremidades da sincronização e a obrigação de a aula terminar depois de começar.

Os testes de regressão reproduziram nove falhas antes da correcção. Após a correcção passaram 50 testes RH/segurança e 13 testes de navegação; lint e inventário aprovados. Não requer migração de base de dados.

## Continuação — detalhe histórico da folha (01/10/2026)

getPayrollRunDetail lia o tipo salarial e o modelo de remuneração dos contratos/políticas actuais, embora o cálculo já os guarde em calculation_details. Uma alteração posterior ao contrato fazia o detalhe histórico mostrar regras diferentes das usadas para obter os valores. A consulta passa a usar exclusivamente os metadados guardados no cálculo. Foram removidas as duas leituras aos contratos/políticas actuais, incluindo a leitura que ignorava erros.

Registos antigos sem metadados devolvem null (a UI existente apresenta «—»); não se infere o passado a partir do contrato actual. JSON não objecto é normalizado para um objecto vazio. Valores monetários, aprovações e dados pessoais não foram alterados. Confirmada em READ ONLY na produção a presença de salary_type e remuneration_model na função de cálculo. Não requer migração.

Os testes do handler reproduziram seis falhas antes da correcção. Após a correcção passaram 60 testes RH/segurança. Cobrem alterações posteriores do contrato, metadados ausentes/malformados, escola em todas as leituras, ordem de autorização, competência inacessível e erro na leitura de itens. Lint e build de produção aprovados.

## Continuação — revisão de faltas (01/10/2026)

reviewHrAbsence já condicionava a escrita ao estado pending, mas não verificava se alguma linha tinha sido alterada. Duas revisões concorrentes podiam receber saved: true embora só a primeira persistisse. A decisão exige agora retorno da linha actualizada; zero linhas devolve conflito explícito com pedido de actualização da lista. A escrita também exclui registos removidos entretanto (deleted_at). A verificação de 2FA precede o carregamento do cliente privilegiado, pois a classificação validada pode influenciar descontos salariais.

O handler mantém as guardas de papel e grant de escrita, escola, estado pendente e actor. Não altera fórmulas nem recalcula folhas antigas. Não requer migração. Oito testes do handler cobrem validar/rejeitar, retorno vazio, MFA, decisões anteriores, registo inexistente, erro da base e grant de leitura. Quatro testes falharam antes da correcção; passaram 68 testes RH/segurança após a correcção. Concorrência real PostgreSQL não foi ensaiada; o teste simula o retorno vazio da actualização condicional.

Verificação de tipos, lint e build de produção aprovados nesta continuação. Nenhuma escrita de teste realizada na produção.
