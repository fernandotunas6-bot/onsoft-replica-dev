# Confirmação de pagamentos e recibos — 28/10/2026

Base: `1afe282f9d4632f3b8787f23d2fbec5e8936574e`, PR #386; CI dessa base
`40699291229` aprovado. Este incremento altera o cliente SIGA TSX e funções
financeiras existentes. Não foram alterados ecrãs Flutter nem executados
pagamentos, SQL de escrita, migrações, merge ou deploy.

## Problemas e comportamento final

1. **Tentativa manual sem chave.** O cartão Multicaixa envia agora uma chave UUID
   por tentativa, incluindo factura, valor, referência, método e data. Uma falha
   de rede conserva a chave para repetir a tentativa enquanto o cartão estiver
   montado. A ficha do aluno também passa a enviar a chave, como Faturas/Caixa.
   O servidor encaminha-a até à RPC da sessão. Se a RPC não reconhecer a chave,
   a escrita termina com erro; deixou de repetir automaticamente sem a chave.
2. **Saldo excessivo por erro/corte de recibos.** A referência lê todos os recibos
   emitidos da factura/escola em páginas, verificando os erros e o tecto. Soma em
   cêntimos e desconta por `invoiceOpenAmount`. Falhar a leitura não equivale a
   zero pago. Estornos, outra escola e outra factura ficam de fora.
3. **Planos liquidados prematuramente.** Confirmar uma prestação parcial não muda
   todos os planos para liquidado. O acerto legado corre apenas com a factura
   integralmente paga, e sempre limitado à escola e factura. Deixou de acertar
   por referência isolada, que podia atingir outro documento. Falha do acerto
   é registada em operações; não transforma o recibo aceite em pagamento falhado.
4. **Referência antiga durante recálculo.** Alterar a data do comprovativo mostra
   actualização, oculta referência/valor antigos e bloqueia copiar/confirmar até
   o resultado actual chegar. Data vazia/futura não é tratada como hoje. A data
   seleccionada segue explicitamente na geração e na confirmação; evita depender
   da data implícita do servidor. Mudar de factura desmonta o estado anterior.
5. **Repetição após sucesso.** Há bloqueio síncrono durante a confirmação; depois
   da resposta aceite, o cartão mostra o recibo e retira a acção de confirmar.
   A confirmação visual vem do servidor, nunca do clique ou de redirect.
6. **Pagamento confundido com impressão.** Após um recibo aceite, cache e PDF
   passam por `finishRecordedPayment` em Faturas, Caixa e ficha do aluno.
   Falhas desses efeitos não rejeitam a submissão nem convidam a cobrar outra
   vez: o aviso preserva o recibo e indica Movimentos de Caixa/actualizar a lista.
7. **Cartão utilizável no telefone.** Cabeçalho e campos adaptam-se a 320 px;
   copiar e escolher data têm alvos de pelo menos 44 px. Estados usam o módulo
   `payment-states`. Sucesso de cópia só é mostrado depois de a clipboard aceitar;
   o indicador está associado ao texto efectivamente copiado. Informação técnica
   do webhook deu lugar à indicação de verificar o comprovativo; a configuração
   de integrações continua no respectivo módulo.

## Contratos e perfis

Mantidos `recordInvoicePayment`, `confirmManualMulticaixaPayment` e
`generateInvoicePaymentReference`, as guardas financeiras e a RPC `register_payment`
com JWT da sessão. A leitura auxiliar recebe o cliente já autorizado, sem criar
outro cliente privilegiado. A confirmação manual acrescenta `idempotencyKey`
opcional para preservar clientes legados e devolve `invoiceStatus`; os ecrãs
actuais de recebimento enviam a chave.

Não existe nova tabela, papel, fornecedor ou regra de permissão. Gerar referência
não comprova recebimento. Confirmação manual continua a exigir que a Tesouraria
verifique o comprovativo. Planos ainda pendentes após pagamento parcial não
significam que o dinheiro recebido foi perdido: o recibo e o saldo são a verdade.

## Evidência de esquema efectiva — leitura apenas

Em 28/10/2026, `pg_proc` confirmou `public.register_payment` com `idempotency_key uuid`
e `private.register_payment` com `target_idempotency_key uuid`. A definição efectiva
contém tranca `FOR UPDATE`, procura pela chave, marcador de repetição e rejeição
da chave usada para outro pagamento. `pg_indexes` confirmou o índice único
`finance_receipts_school_idempotency_key` sobre `(school_id, idempotency_key)`
quando a chave não é nula. São provas de definição/esquema; não são um ensaio de
pagamento em produção nem uma afirmação sobre o histórico de migrações aplicado.
Nenhum dado pessoal ou transacção real foi lido neste incremento.

## Validação

| Âmbito | Resultado / evidência | Limite |
| --- | --- | --- |
| Servidor e formulário | 25 testes específicos de confirmação/data/conclusão passaram | Servidor e rede simulados |
| Suite integral | 5406 testes passaram, 19 saltados; 777 ficheiros passaram e 3 saltados | Não equivale a E2E com utilizadores reais |
| Build / tipos / lint | Passaram após o incremento | Conferir novo CI no SHA enviado |
| Navegador | Lista em nove viewports e cartão de pagamento em 320, 390, 768 e 1440 px passaram | Chromium 140 headless, contexto/API fictícios |
| Fluxo do cartão | Recálculo bloqueia valor antigo; clipboard real; duplo clique envia uma tentativa com chave/data; recibo aceite impede nova confirmação | Nenhum pagamento real |
| Esquema / deduplicação | Assinatura, lógica e índice confirmados por leitura de metadados | Sem sessão real, concorrência remota ou fornecedor |

Reprodução: `node scripts/qa/finance-student-ledger.mjs` (Chromium instalado).
Relatório e PNGs em `reports/finance-student-ledger/`, ignorados no Git.
O relatório inclui o blob do cartão de pagamento
`3b32f577144182cb1fd3e3ba86fcbcd9718e8f5e` e o do componente de lista.

## Pendências e reversão

As chaves de tentativa vivem na memória da página: recarregar ou abrir noutro
aparelho não reconstrói uma tentativa anterior. O incremento não identifica
automaticamente o mesmo comprovativo apresentado por dois operadores. Clientes
legados sem chave continuam compatíveis, sem a garantia da tentativa idempotente.
Após resposta incerta, conferir os movimentos antes de iniciar um pagamento novo.

Continuam pendentes sessões reais de duas escolas/perfis, validação em aparelhos
físicos e outros navegadores, e ensaios com o fornecedor. A interface não permite
confirmar um recibo sem a resposta do servidor, mas este ensaio não homologa EMIS,
AppyPay, QR ou webhook. A reversão consiste em reverter o commit do incremento;
não há alterações de esquema a desfazer.
