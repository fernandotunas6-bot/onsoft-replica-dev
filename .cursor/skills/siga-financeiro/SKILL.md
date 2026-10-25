---
name: siga-financeiro
description: >-
  Extends SIGA treasury, invoices and payment plans including Multicaixa
  Express and Unitel Money config. Use when editing /financeiro, /faturas,
  or src/features/finance.
---

# SIGA · Tesouraria

Billing da **plataforma** (assinatura SIGA, upgrade, planos comerciais) não
pertence aqui — fica em ADMIN/WEB. Ver `siga-ecosystem`.

- Rotas: `tesouraria.tsx` (visão geral), `financeiro.tsx` (Movimentos de Caixa),
  `faturas.tsx`, `financeiro_.conciliacao.tsx` (Bancos e Conciliação),
  `relatorios.financeiros.tsx`. **Uma página, uma finalidade**: a matriz rota → funções
  está em `docs/specs/finance/FINANCE_MASTER_2026.md`, e há testes que a trancam
  (`tests/ui/finance-installed-tools-context.test.ts`, `page-header-area-coherence`).
- Estados do dinheiro: mostrar sempre por `src/features/finance/payment-states.ts`
  (fatura, cobrança do gateway, recibo, plano), nunca com rótulos à mão.
- RH / Folha (submódulo): skill `siga-rh` — `/financeiro/rh*` e `/professor/presenca`
- Domínio: `src/features/finance/{schemas,server,payflow-sso,payflow-education-sync,payflow-sync-execute}.ts`
- PayFlow UI: `PayflowAdminLaunchButton`, `PayflowStudentSyncButton`, `PayflowBankSyncButton`, `PayflowPayerLink` (portais aluno/encarregado)
- Acesso: Admin/Tesouraria
- Recibos SGA: método efectivo muitas vezes só `cash`.

## Regras

1. Pagamento avançado: `createPaymentPlan` → `finance_payment_plans` com canal
   `multicaixa_express` | `unitel_money` | `transfer` | `cash`, estado `pending_gateway`.
2. Sem tabela: `listPaymentPlans` devolve `[]` (não partir a página).
3. Sem gateway EMIS real na cloud — webhook `POST /api/finance/gateway/confirm` liquida
   planos `pending_gateway` quando a referência coincide; confirmação manual continua
   disponível. Referências Multicaixa são determinísticas por fatura.
   Teste local: `npm run siga:gateway-simulate -- --invoice-id=<uuid>`.
4. SQL: `APPLY_ENROLLMENT_AND_PREMIUM.sql` cria `finance_payment_plans`.
5. Ficha do aluno pode emitir fatura (Secretaria/Admin). `paymentStatusFromInvoices` calcula settled/pending/overdue.
6. `/faturas` recebe pagamento na linha (**Receber**) e imprime o recibo no modelo `service-document` com **Dados de pagamento** (IBAN de Definições → Financeiro; fallback `officialReceiptBody`). **Fatura** imprime o documento de cobrança. A lista tem **Oficial** e só as funções instaladas do módulo `faturas`. Faturas pagas têm **Recibo**. Sem recibos: **Anular** (`cancelInvoice` → `cancelled`). Admin também recebe na ficha. Com Resend/WhatsApp: partilha da fatura, do recibo de caixa e da referência do plano. Relatório financeiro partilha o resumo por WhatsApp e **E-mail** Resend dentro do menu «Exportar»; PDFs oficiais incluem logótipo (`branding.logo_url`) e IBAN.
7. Relatório financeiro: CSV/PDF das tabelas, **Oficial** completo e **Oficial cobrança** / **Oficial categorias** por secção (fallback `exportOfficialPautaPdf`). Caixa tem **Recibo** por lançamento, **Oficial** na lista filtrada e **Talão** nos planos. Cada página mostra só as funções instaladas do seu módulo (`financeiro` em Caixa, `faturas` em Faturas; Relatórios nenhuma). Helper: `src/lib/finance-print.ts`.
8. **Arquivo na biblioteca**: receber/emitir/criar plano (e imprimir talão) grava stub em `siga_files` com ID pesquisável (`library_document_code`) e liga ao aluno via `related_person_id` quando existe.
9. **PayFlow:**
   - SSO admin: `createPayflowAdminLaunch` + botão Conciliação (requer `PAYFLOW_SSO_SECRET`).
   - Sync aluno: `syncStudentToPayflow` / `executePayflowStudentSync`.
   - Sync IBAN: `syncSchoolBankToPayflow` em Definições → Financeiro (também após «Guardar banco»).
   - Auto-sync após emitir fatura: só com `PAYFLOW_AUTO_SYNC=1` (best-effort, não bloqueia).
   - Segredos só no servidor: `PAYFLOW_INTEGRATION_API_KEY`, `PAYFLOW_SSO_SECRET` (nunca `VITE_`).
   - Extrato CSV: `POST /api/v1/bank-statements/import` (dry-run; conciliar = `bank_statement`). Isolamento por `school_id`.
   - Estorno: `POST /api/v1/payments/:id/refund` (só `finance_admin`; não apaga recibo). Acerto SIGA: `POST /api/finance/payflow/settlement`.
   - API bancária: `POST /api/v1/bank-movements/ingest`. Pull: `POST /api/v1/bank-movements/pull` ou CLI `npm run siga:payflow-bank-pull`. Sandbox: feed `sandbox-feed` (só `PAYFLOW_RUNTIME_MODE=sandbox`).
   - Alertas: `PAYFLOW_ALERT_WEBHOOK_URL` (opt-in HTTPS; fail-closed). Inclui falhas de acerto SIGA.
   - Health: `GET /api/v1/health` → banco / settlement / alertas / EMIS (sem segredos).
   - Webhook EMIS: `POST /api/v1/webhooks/emis` (HMAC; fail-closed; não liquida até adaptador de produção).
10. **Fiscal:** o SIGA não é software de facturação certificado pela AGT. Nunca gerar
    linhas «AGT;…», QR «fiscais» nem rótulos que o sugiram; documentos com valor levam o
    aviso de documento interno (`document.financial` em `print-issue.ts`).
11. **QR:** só o de verificação (`/verificar`) e os de presença/acesso. QR de pagamento
    só quando o fornecedor o emitir; nunca montar payloads bancários (`EMIS|ENT:…`).
12. **Integridade:** pagamentos só por `register_payment` (com `idempotencyKey` do
    `usePaymentAttemptKey`); estornos só por `siga_reverse_finance_receipt`. Migrações
    por aplicar: `20261024090000`, `20261024100000`, `20261024110000` (sessões de caixa).
