# SIGA Plus Finance Master 2026

**Data:** 25/10/2026 · **Ciclo:** auditoria contextual do Financeiro (Etapas A–B do Prompt Master Finance 2026)
**Âmbito desta versão:** diagnóstico verificado no código e na base de produção, mais a correcção contextual já executada.
**Documentos complementares:** [matriz de contexto por rota](FINANCE_ROUTE_CONTEXT_MATRIX.md) ·
[lista de aceitação](../../qa/finance/FINANCE_ACCEPTANCE_CHECKLIST.md) ·
[contrato visual](../../design/VISUAL_MASTER_2026.md) · [tesouraria escolar](../modules/finance.md) ·
[regras da base de dados](../../agents/DATABASE_RULES.md)

## Lei aplicável a todo o Financeiro

**UMA PÁGINA = UMA FINALIDADE = FUNÇÕES EXCLUSIVAMENTE CONTEXTUAIS.**

Ao abrir uma página financeira, o conteúdo principal apresenta o título, a informação
essencial à finalidade, as acções permitidas dessa finalidade, os filtros necessários, os
registos correspondentes e os estados indispensáveis. Navegar para páginas vizinhas é
permitido; **montar o conteúdo dessas páginas na página actual não é.** O cabeçalho global,
o selector de escola, o perfil e a navegação institucional pertencem à estrutura geral e
permanecem.

Nenhuma função é eliminada por esta lei. As funções fora de contexto mudam de lugar.

## 1. Estado real verificado

Distinção obrigatória entre **código presente**, **funcionalidade validada**, **integração
operacional** e **disponibilidade em produção**. O que segue é inspecção dirigida do ramo de
trabalho e do `supabase/PRODUCTION_SNAPSHOT.json`, não execução autenticada de todas as
páginas.

### 1.1 Capacidades com código presente

Planos de propinas (`fee_plans`, `fee_items`), contratos financeiros (`finance_contracts`),
facturas e respectivos eventos (`finance_invoices`, `finance_invoice_events`), recibos
(`finance_receipts`), planos de pagamento com prestações (`finance_payment_plans`), despesas de
caixa (`siga_cash_expenses`), cobranças de gateway (`payment_gateway_charges`), eventos de
webhook de gateway (`finance_gateway_webhook_events`), RH e folha salarial
(`hr_payroll_*`, `hr_payment_*`), geração e validação SAF-T AO
(`src/features/finance/saft-generator.ts`, `saft-validator.ts`), integrações PayFlow, AppyPay,
MULTICAIXA/EMIS e Unitel (`src/features/finance/`), bolsas e multas de atraso
(`scholarships.ts`, `late-fee.ts`), numeração de facturas (`invoice-numbering.ts`) e
liquidação (`invoice-settlement.ts`, `payflow-settlement.ts`).

### 1.2 Lacunas confirmadas na base de produção

As 207 tabelas do snapshot de produção **não incluem** nenhuma tabela de:

| Capacidade                                                        | Estado verificado                                                   |
| ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| Plano de contas, diário, razão, balancete                         | Ausente — não existe tabela de lançamento contabilístico            |
| Centros de custo, períodos contabilísticos, fecho/reabertura      | Ausente                                                             |
| Contas bancárias da escola                                        | Ausente                                                             |
| Movimentos bancários importados e correspondências de conciliação | Ausente — a conciliação existente é do gateway, não bancária        |
| Sessão de caixa, operador, abertura e fecho                       | Ausente — `siga_cash_expenses` registra saídas, não sessão de caixa |

**Consequência:** o SIGA Plus tem **tesouraria e cobrança**, não **contabilidade formal**. Os
movimentos de caixa não são lançamentos contabilísticos e não devem ser apresentados como
tal. Qualquer núcleo contabilístico é trabalho novo, com projecto técnico, migrações próprias e
validação por contabilista qualificado — fora do âmbito desta correcção contextual.

### 1.3 Problemas de contexto confirmados no código

| Ficheiro                       | Problema confirmado                                                              | Estado                  |
| ------------------------------ | -------------------------------------------------------------------------------- | ----------------------- |
| `src/routes/financeiro.rh.tsx` | Painel completo de emissão de QR de presença docente na página da folha salarial | **Corrigido** — ver 2.1 |
| `src/routes/faturas.tsx`       | Cabeçalho com `group="Relatórios"`: facturas classificadas como relatório        | **Corrigido** — ver 2.2 |
| `src/routes/faturas.tsx`       | Importação de pagamentos e portal do pagador no menu de emissão de documentos    | **Corrigido** — ver 2.2 |
| `src/routes/faturas.tsx`       | `InstalledModuleTools module="financeiro"` a injectar ferramentas de tesouraria  | **Corrigido** — ver 2.2 |
| `src/routes/financeiro.tsx`    | Atalho «RH e Folha» no cabeçalho da tesouraria                                   | **Corrigido** — ver 2.3 |
| `src/routes/financeiro.tsx`    | `InstalledModuleTools module="faturas"` a injectar ferramentas de facturação     | **Corrigido** — ver 2.3 |

## 2. Correcções executadas neste ciclo

### 2.1 QR de presença docente sai da folha salarial

Nova rota `/financeiro/rh/aulas` — **Assiduidade Docente** (`src/routes/financeiro.rh.aulas.tsx`).
Recebe integralmente o painel «Presença docente por QR»: tabela de ocorrências, estado da aula,
estado de presença, emissão de QR de check-in e check-out e cartão de validade do desafio.

Nada foi removido. O comportamento é o mesmo: token opaco, validade de minutos, primeiro uso
válido inutiliza o desafio, e só a aula confirmada produz evento remunerável para a folha. A
ligação técnica ao cálculo salarial permanece — o que mudou é que a emissão deixou de ser a
primeira coisa visível para quem abre a folha salarial.

`/financeiro/rh` passou a ligar para a nova página no cabeçalho, e a navegação institucional
(Financeiro → Assiduidade Docente) expõe-a directamente.

### 2.2 Facturas voltam à hierarquia financeira

- `group="Relatórios"` → `group="Financeiro"`. Facturas são documentos de cobrança, não análises.
- Retirados do menu de exportação os itens «Importar Pagamentos (Excel)» e «Portal PayFlow
  (Pagamentos)». **As funções continuam disponíveis** em `/importar` e no cabeçalho de
  `/financeiro`, que é o contexto de tesouraria a que pertencem.
- Retirado `InstalledModuleTools module="financeiro"`; a página mantém as ferramentas do próprio
  módulo (`module="faturas"`).

### 2.3 Tesouraria deixa de montar facturação e salários

- Retirado o atalho «RH e Folha» do cabeçalho de `/financeiro`. A folha salarial continua
  acessível pela navegação institucional.
- Retirado `InstalledModuleTools module="faturas"`; a página mantém `module="financeiro"`.

### 2.4 Protecção contra regressão

`tests/finance/route-context-matrix.test.ts` fixa a matriz de pertença sobre a fonte das rotas:
reintroduzir um painel ou atalho fora de contexto falha o teste antes da revisão.
`tests/routes/financeiro-rh-aulas.test.tsx` cobre a nova página (estado vazio, QR de entrada, QR
de saída, erro de carregamento). `tests/routes/financeiro-rh.test.tsx` ganhou uma asserção
explícita de que a folha salarial não emite QR de presença.

## 3. Regras permanentes do QR Code

Três finalidades distintas, nunca um QR genérico apresentado como servindo qualquer uma delas:

| Finalidade                       | Onde pertence                                           | Regra                                                                                                                                                                                                           |
| -------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **QR de pagamento**              | Tesouraria / Pagamentos                                 | Só QR emitido ou autorizado pelo provedor; dinâmico quando suportado; verificação server-side obrigatória. A leitura do QR **nunca** é confirmação de pagamento. Não inventar payloads bancários proprietários. |
| **QR de verificação documental** | Documento emitido                                       | Endereço de verificação seguro; a página pública revela apenas o indispensável, nunca dados privados do aluno.                                                                                                  |
| **QR de presença**               | `/financeiro/rh/aulas`, assiduidade, controlo de acesso | Token opaco, validade curta, uso único. O Financeiro **consome** resultados de presença aprovados para o cálculo salarial; não é o ecrã de emissão.                                                             |

Num mesmo documento, o utilizador tem de perceber sem ambiguidade se um QR serve para pagar ou
para verificar. Não colocar QR repetidos ou de função ambígua.

## 4. Enquadramento fiscal — limites a respeitar

O SIGA Plus **não é software de facturação certificado pela AGT**. Por consequência:

- Não apresentar exportações SAF-T AO ou documentos internos como fiscalmente certificados.
- Distinguir explicitamente, no produto e nos dados: documento interno · documento preparado
  para exportação · documento fiscal válido · documento enviado para validação · documento
  aceite ou rejeitado pela AGT.
- Não executar submissões fiscais reais em testes.
- O enquadramento da facturação electrónica em Angola está em evolução (obrigações iniciadas em
  2026, outras previstas para 2027) e não é uniforme entre escolas. Verificar as condições de
  cada entidade antes de activar emissões fiscais reais.
- O financeiro da escola e a subscrição SaaS da escola ao SIGA Plus permanecem separados. As
  credenciais e contas financeiras de uma escola nunca são reutilizadas noutra.

## 5. Proposto e não executado

Fora do âmbito desta correcção contextual, por exigir migrações em base de produção, projecto
técnico próprio ou validação externa:

1. **Núcleo contabilístico** (plano de contas, diário, razão, balancete, centros de custo,
   períodos, fecho/reabertura). Exige projecto, migrações, PGC aplicável em Angola e validação
   por contabilista qualificado.
2. **Sessão de caixa** (posto, operador, abertura, fecho, diferenças, relatório de fecho) e
   separação explícita entre saldo de numerário e saldo bancário.
3. **Bancos e conciliação bancária** (contas da escola, movimentos importados, correspondência
   com evidência de referência/data/conta/identificador do provedor, revisão humana dos casos
   ambíguos). A conciliação actual é de gateway.
4. **Páginas dedicadas** de Propinas e Cobranças, Pagamentos, Recibos e Relatórios conforme a
   estrutura proposta — a executar depois de mapear função a função no código actual, sem criar
   menus duplicados.
5. **Precisão monetária** auditada em todo o apuramento (unidades mínimas inteiras ou decimal
   exacto, regras de arredondamento declaradas).
6. **Separação de funções** reforçada: quem registra uma despesa não a aprova; quem altera dados
   bancários não oculta a alteração.
7. **Medição de desempenho** antes/depois por rota financeira (INP ≤ 200 ms, LCP ≤ 2,5 s,
   CLS ≤ 0,1 no p75).

## 6. Regras para nova funcionalidade financeira

Toda nova funcionalidade financeira deve: pertencer a uma área claramente definida; usar os
componentes visuais oficiais; respeitar a matriz de contexto da rota; preservar a consistência
transaccional; respeitar multi-tenant, RBAC, MFA/AAL2 e RLS; possuir testes; não introduzir
elementos visuais estranhos à página; e não duplicar funcionalidades existentes.
