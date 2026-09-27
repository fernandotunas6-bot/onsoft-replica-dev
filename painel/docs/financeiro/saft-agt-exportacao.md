# Exportação SAFT-AO / AGT

Guia para tesourarias e secretarias escolares sobre o cumprimento das obrigações fiscais da **Administração Geral Tributária (AGT)** de Angola e exportação do ficheiro **SAFT-AO (XML)**, conforme o **Decreto Presidencial n.º 312/18**, a **Portaria n.º 63/19** e o **Código do IVA (CIVA)**.

> O SIGA gera um ficheiro com a estrutura `AO_1.01_01` a partir das **faturas** (`finance_invoices`) e dos **recibos** (`finance_receipts`) do período.
>
> **Importante:** o SIGA **não é software de facturação certificado pela AGT** e não assina as faturas com a chave da AGT. Por isso o ficheiro leva `SoftwareCertificateNumber` = `0` e `Hash` = `0` em todos os documentos, e a exportação mostra sempre esse aviso. Serve para conferência, para o contabilista e para importar no software certificado da escola — não substitui o SAF-T emitido por um programa certificado.

---

## Enquadramento Legal & Fiscal no Setor da Educação

1. **Decreto Presidencial n.º 312/18, de 21 de Dezembro**:
   - Regulamenta a obrigatoriedade de utilização de programas de faturação certificados pela AGT e a emissão do ficheiro SAF-T AO.
2. **Portaria n.º 63/19, de 14 de Março**:
   - Define a estrutura de dados do ficheiro SAF-T AO (Standard Audit File for Tax purposes - Versão 1.01_01).
3. **Código do Imposto sobre o Valor Acrescentado (CIVA - Artigo 12.º, alínea e)**:
   - **Isenção de IVA para Estabelecimentos de Ensino**: Estão isentas de IVA as transmissões de bens e prestações de serviços conexas com o ensino escolar e formação profissional reconhecidas pelo Ministério de tutela.
   - **Código de Isenção no SAF-T**: `M00` ou `M04`.
   - **Menção Obrigatória**: *"Isento de IVA nos termos da alínea e) do art. 12.º do CIVA"*.

---

## Tipos de Documentos Fiscais

| Código | Descrição | Utilização no SIGA |
|---|---|---|
| **`FT`** | Fatura | Cobrança de propinas, serviços ou emolumentos escolares a prazo. |
| **`FR`** | Fatura-Recibo | Cobrança liquidada no ato (pronto pagamento em caixa/TPAs). |
| **`FS`** | Fatura Simplificada | Emissões a consumidor final com montantes reduzidos. |
| **`NC`** | Nota de Crédito | Retificação ou anulação de fatura emitida anteriormente. |
| **`ND`** | Nota de Débito | Débito adicional ou ajuste de valores a favor da escola. |

---

## Pré-requisitos de Configuração

| Item | Onde configurar | Validação |
|---|---|---|
| **NIF da escola** | Definições → **Escola** | 9–10 dígitos fiscais (bloqueia se inválido ou placeholder). |
| **Denominação e Morada** | Definições → **Escola** | Nome oficial, endereço e província/cidade. |
| **Software certificado AGT** | Definições → **Financeiro** → AGT | Só se a escola tiver um número de certificação válido. Vazio → o ficheiro leva `0`. Mesmo preenchido, os documentos continuam sem assinatura (`Hash` = `0`). |
| **Série de faturação** | Definições → **Financeiro** → AGT | Prefixo da série (ex.: `FT 2026`). |
| **Faturas emitidas** | `/faturas` | Registos de cobrança do ano fiscal selecionado. |

---

## Procedimento de Exportação e Validação

1. Aceder ao módulo **`/faturas`**.
2. Clicar no menu **Exportar & SAFT-AO** → **Ficheiro SAFT-AO (XML)**.
3. Escolher o **Ano Fiscal** (ex.: 2026).
4. O SIGA executa o **Validador Estrutural Offline**:
   - Inspeciona o cabeçalho (`Header`), NIF da empresa, tabela de clientes (`MasterFiles`), produtos, documentos de venda (`SalesInvoices`) e recibos (`Payments`).
   - É uma verificação de **estrutura**: não substitui a validação da AGT.
5. O navegador descarrega o ficheiro `SAFT-AO_{NIF}_{ano}.xml` (sem assinatura digital).

Faturas anuladas e recibos estornados entram com estado `A` (anulado) e a data da anulação ou do estorno; não contam nos totais. Cada recibo indica a fatura que liquida e a data dessa fatura.

---

## Submissão no Portal do Contribuinte da AGT

Só com um ficheiro produzido por software certificado. Com o ficheiro do SIGA, confirme primeiro com o contabilista.

1. Aceder a [https://portaldocontribuinte.minfin.gov.ao](https://portaldocontribuinte.minfin.gov.ao).
2. Autenticar com o NIF da instituição e palavra-passe tributária.
3. Aceder a **Declarações Electrónicas** → **Submeter Ficheiro SAF-T AO**.
4. Carregar o ficheiro XML e confirmar o resumo de faturação.
5. Guardar o comprovativo digital de entrega emitido pelo sistema da AGT.

---

## Resolução de Problemas Frequentes

| Mensagem / Problema | Causa Provável | Solução |
|---|---|---|
| **NIF em falta / inválido** | Campo NIF vazio ou menor que 9 dígitos. | Aceder a Definições → Escola e introduzir o NIF fiscal. |
| **Nenhuma fatura no período** | Sem emissões fiscais no ano selecionado. | Confirmar filtros de data e lançamentos em `/faturas`. |
| **Versão inesperada** | XML com schema divergente. | O SIGA usa `1.01_01` (Portaria 63/19) de forma nativa. |
| **Cliente genérico (999999999)** | O ficheiro ainda não leva o NIF do encarregado: todos os clientes saem como consumidor final. | Nada a fazer por agora; o nome do aluno identifica o cliente. |
| **Morada "Desconhecido"** | Morada ou cidade da escola por preencher. | Definições → Escola. |

---

## Links Úteis

- [Portal do Contribuinte da AGT](https://portaldocontribuinte.minfin.gov.ao)
- [Consultar NIF do Contribuinte](https://portaldocontribuinte.minfin.gov.ao/consultar-nif-do-contribuinte)
- [Legislação Fiscal Angolana — Portal AGT](https://agt.minfin.gov.ao)

