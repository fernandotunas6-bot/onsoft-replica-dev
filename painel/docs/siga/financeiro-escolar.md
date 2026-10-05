# Financeiro escolar

O **Financeiro** trata do dinheiro entre a escola, os alunos e os encarregados. A assinatura da escola ao SIGA Plus é outra coisa e trata-se no portal WEB e no ADMIN.

Quem usa: Administrador e Tesouraria. O aluno e o encarregado vêem as suas facturas no portal.

## Antes de começar

1. Em **Definições → Financeiro**, defina a propina, a matrícula e outros serviços, e os dados bancários da escola com IBAN.
2. Confirme o NIF da escola em Definições → Escola. Sem ele não há exportação fiscal.
3. Active a verificação em dois passos nas contas da Tesouraria.

## Facturas e recibos

- **Facturas:** em `/faturas`, emita facturas por aluno. Cada factura tem estado aberto, parcialmente pago, pago ou anulado.
- **Receber:** regista um pagamento e emite o recibo. Um pagamento parcial deixa a factura parcialmente paga.
- **Desconto e multa:** o valor a pagar é o total menos o desconto. A regra da multa por atraso está em decisão e será uma definição por escola.
- **Anular:** só é possível numa factura sem recibos.
- **Estornar um recibo:** exige dois passos, recalcula o estado da factura e não permite estornar o mesmo recibo duas vezes.

## Caixa e despesas

- O caixa mostra as entradas e saídas do dia, com recibo para cada lançamento.
- As despesas registam-se com categoria e exigem dois passos.
- A saída de caixa de um salário não se anula no caixa: faz-se nos RH.

## Planos de pagamento

Um plano divide uma dívida em prestações. Cada plano tem talão para imprimir e pode ser cancelado enquanto estiver pendente.

## Pagamentos electrónicos

| Via                                   | Como funciona                                                                                                  |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Referência EMIS / Multicaixa e Unitel | A escola configura a integração. O banco confirma cada pagamento por webhook assinado e o SIGA emite o recibo. |
| AppyPay                               | O SIGA confirma cada cobrança na API do fornecedor antes de emitir o recibo.                                   |
| Transferência por IBAN pelo PayFlow   | O pagador envia o comprovativo. O recibo só sai depois de o movimento aparecer no extrato.                     |

Um comprovativo enviado ou um regresso do browser nunca contam como pagamento. Só a confirmação do banco ou do fornecedor conta.

## Relatórios e exportação fiscal

- **Relatórios financeiros:** cobrança, dívida por aluno e caixa por categoria, com versão oficial em PDF com logótipo e IBAN.
- **SAF-T AO:** exporta o ficheiro para a AGT. O SIGA ainda não é um programa de facturação certificado, por isso o ficheiro sai sem certificado nem assinatura.

Detalhes técnicos: [Exportação SAF-T AO](/financeiro/saft-agt-exportacao) e [PayFlow](/financeiro/payflow).
