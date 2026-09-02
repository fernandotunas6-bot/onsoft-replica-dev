# Exportação SAFT-AO / AGT

Guia para tesourarias e secretarias escolares sobre o cumprimento das obrigações fiscais da **Administração Geral Tributária (AGT)** de Angola e exportação do ficheiro **SAFT-AO (XML)**, conforme o **Decreto Presidencial n.º 312/18**, a **Portaria n.º 63/19** e o **Código do IVA (CIVA)**.

> O SIGA gera um ficheiro estruturado a partir das **faturas escolares** (`finance_invoices`) em estrita conformidade com o schema `AO_1.01_01`. A submissão electrónica final é efectuada no **Portal do Contribuinte da AGT**.

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
| **Software certificado AGT** | Definições → **Financeiro** → AGT | Número de certificação atribuído pela AGT (`0/AGT/2026`). |
| **Série de faturação** | Definições → **Financeiro** → AGT | Prefixo da série (ex.: `FT 2026`). |
| **Faturas emitidas** | `/faturas` | Registos de cobrança do ano fiscal selecionado. |

---

## Procedimento de Exportação e Validação

1. Aceder ao módulo **`/faturas`**.
2. Clicar no menu **Exportar & SAFT-AO** → **Ficheiro SAFT-AO (XML)**.
3. Escolher o **Ano Fiscal** (ex.: 2026).
4. O SIGA executa o **Validador Estrutural Offline**:
   - Inspeciona o cabeçalho (`Header`), NIF da empresa, tabela de clientes (`MasterFiles`), produtos e documentos de venda (`SalesInvoices`).
   - Identifica anomalias antes do envio à AGT.
5. O navegador descarrega o ficheiro assinado `SAFT-AO_{NIF}_{ano}.xml`.

---

## Submissão no Portal do Contribuinte da AGT

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
| **Cliente genérico (999999999)** | Fatura sem encarregado/aluno associado. | Preencher o NIF ou BI do encarregado na ficha do aluno. |

---

## Links Úteis

- [Portal do Contribuinte da AGT](https://portaldocontribuinte.minfin.gov.ao)
- [Consultar NIF do Contribuinte](https://portaldocontribuinte.minfin.gov.ao/consultar-nif-do-contribuinte)
- [Legislação Fiscal Angolana — Portal AGT](https://agt.minfin.gov.ao)

