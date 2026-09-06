---
name: siga-rh
description: >-
  Extends SIGA HR, teacher attendance, payroll and salary payment orders.
  Use when editing /financeiro/rh, /professor/presenca, folha salarial,
  faltas, ou src/features/hr.
---

# SIGA · Recursos Humanos e Folha

Submódulo financeiro: vínculos, contratos, assiduidade docente (QR),
faltas, ciclo operacional da folha e ordens de pagamento salarial.
Reutiliza `people` / `person_roles` — não duplicar identidade.

## Contratos (fonte única)

`src/features/hr/schemas.ts` — enums, máquinas de estado, inputs Zod e helpers
(`canTransitionPayrollRun`, `canConfirmPaymentItem`, `maskPaymentDestinationLabel`,
`compensationValidationFromAssurance`). Estender aqui; não recriar Zod inline
nos server fns.

## Rotas

| Rota | Papel | Função |
|------|-------|--------|
| `/financeiro/rh` | Admin / Tesouraria | Dashboard RH + QR de aula |
| `/financeiro/rh/folha` | Admin / Tesouraria | Ciclo operacional da folha |
| `/financeiro/rh/faltas` | Admin / Tesouraria | Revisão/justificação de faltas |
| `/financeiro/rh/presenca` | Admin / Tesouraria | Políticas e validação de presença |
| `/financeiro/rh/pagamentos` | Admin / Tesouraria | Ordens salariais (controlo duplo) |
| `/professor/presenca` | Professor | Check-in/out QR do docente |

## Domínio

- `schemas.ts` — contratos + máquina de estados
- `server.ts` — dashboard e listagens base
- `payroll.ts` — competência, cálculo, aprovação
- `payments.ts` — lotes, autorização, confirmação → caixa
- `absences.ts` — faltas funcionais
- `teacher-lessons.ts` — ocorrências + QR
- `attendance-assurance.ts` — geofence / score
- `teacher-lesson-exceptions.ts` — substituição / aula extra / política de tolerância
- `materialize-lessons.ts` — sincronizar aulas do horário
- `TeacherAttendancePanel.tsx` — UI professor

## Máquinas de estado

### Folha (`hr_payroll_runs`)

```
draft → calculating → review → approved → processing → paid
         ↘ cancelled em draft/calculating/review/approved
```

- Valores monetários **congelados** em `approved | processing | paid`
  (`isPayrollFinanciallyLocked` / `HR_PAYROLL_LOCKED_STATUSES`).
- Aprovar ≠ pagar. Só `paid` quando todos os itens da ordem estiverem pagos.

### Ordem salarial (`hr_payroll_payment_batches`)

```
draft → ready → authorized → processing ⇄ partial → completed
```

- Controlo duplo por omissão: quem prepara ≠ quem autoriza (`require_dual_control`).
- Item confirmável só em `authorized | processing | failed`
  (`canConfirmPaymentItem`).
- `paid` → saída `Salários` em `siga_cash_expenses`; `failed` **não** cria saída.

### Assiduidade / remuneração

| Modelo contrato | Como remunera |
|-----------------|---------------|
| `fixed_deduct_absence` | Base − faltas validadas (mensalista) |
| `validated_units` | Só unidades validadas (hora / hora-aula) |
| `hybrid` | Base + adicionais validados − descontos |

Faltas: `justified_paid` | `justified_unpaid` | `unjustified` — nascem `pending`.
Compensação de aula só `validated` com assurance check-out `auto_approve`.

## Regras críticas

1. **Aprovar folha ≠ pagar.** Valores imutáveis após `approved`.
2. **Autorizar ordem ≠ executar transferência.** Controlo duplo por omissão.
3. Saída `Salários` só após confirmação `paid` do item.
4. Falha de pagamento **não** cria saída de caixa.
5. Horário programado **não** prova aula; falta automática nasce `pending`.
6. Token QR bruto **nunca** persistido — só `token_hash`.
7. Compensação de aula só `validated` com evidência `check_out` `auto_approve`
   (`hr_gate_teacher_compensation_by_assurance` + hardening `20260906190000`).
8. Listagens de destino mascaram IBAN (`maskPaymentDestinationLabel`).
9. Escrita: `loadSgaAdminClient` + roles Admin/Tesouraria.
10. SQL SGA: Ciclo 56 em `APPLY_ENROLLMENT_AND_PREMIUM.sql` (+ migrations `20260906*_hr_*`).
    Policies usam `is_school_member() → boolean` (padrão SGA).

## Fora de âmbito (ainda)

Integração bancária real, webhooks, WebAuthn/App Attest, IRT/INSS definitivo,
holerite oficial, scheduler diário, RPC atómica única RH+caixa.

## Inventário

`scripts/siga/modules.json` → id `rh`, skill `siga-rh`, accessKey `financeiro`.
Testes: `tests/hr/schemas-contract.test.ts`.
