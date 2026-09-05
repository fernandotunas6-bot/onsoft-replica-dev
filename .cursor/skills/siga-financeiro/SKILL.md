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

- Rotas: `financeiro.tsx`, `faturas.tsx`, `relatorios.financeiros.tsx`
- Domínio: `src/features/finance/{schemas,server,payflow-sso,payflow-education-sync}.ts`
- PayFlow UI: `PayflowAdminLaunchButton`, `PayflowStudentSyncButton`, `PayflowBankSyncButton`
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
6. `/faturas` recebe pagamento na linha (**Receber**) e imprime o recibo no modelo `service-document` com **Dados de pagamento** (IBAN de Definições → Financeiro; fallback `officialReceiptBody`). **Fatura** imprime o documento de cobrança. A lista tem **Oficial** e toolbars `financeiro` + `faturas`. Faturas pagas têm **Recibo**. Sem recibos: **Anular** (`cancelInvoice` → `cancelled`). Admin também recebe na ficha. Com Resend/WhatsApp: partilha da fatura, do recibo de caixa e da referência do plano. Relatório financeiro tem AGT, WhatsApp e **E-mail** Resend; PDFs oficiais incluem logótipo (`branding.logo_url`) e IBAN.
7. Relatório financeiro: CSV/PDF das tabelas, **Oficial** completo e **Oficial cobrança** / **Oficial categorias** por secção (fallback `exportOfficialPautaPdf`). Caixa tem **Recibo** por lançamento, **Oficial** na lista filtrada e **Talão** nos planos. `/financeiro` e `/faturas` mostram toolbars de integrações instaladas. Helper: `src/lib/finance-print.ts`.
8. **Arquivo na biblioteca**: receber/emitir/criar plano (e imprimir talão) grava stub em `siga_files` com ID pesquisável (`library_document_code`) e liga ao aluno via `related_person_id` quando existe.
9. **PayFlow:**
   - SSO admin: `createPayflowAdminLaunch` + botão Conciliação (requer `PAYFLOW_SSO_SECRET`).
   - Sync aluno: `syncStudentToPayflow` (matrícula activa + faturas + IBAN) → `/api/v1/education/sync`.
   - Sync IBAN: `syncSchoolBankToPayflow` em Definições → Financeiro (também após «Guardar banco»).
   - Segredos só no servidor: `PAYFLOW_INTEGRATION_API_KEY`, `PAYFLOW_SSO_SECRET` (nunca `VITE_`).
   - DOC: `/financeiro/payflow` (`DOC_PATHS.financePayflow`).
