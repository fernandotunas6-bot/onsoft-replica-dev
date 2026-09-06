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

- `src/features/hr/server.ts` — dashboard e listagens base
- `src/features/hr/payroll.ts` — competência, cálculo, aprovação
- `src/features/hr/payments.ts` — lotes, autorização, confirmação → caixa
- `src/features/hr/absences.ts` — faltas funcionais
- `src/features/hr/teacher-lessons.ts` — ocorrências + QR
- `src/features/hr/attendance-assurance.ts` — geofence / score
- `src/features/hr/TeacherAttendancePanel.tsx` — UI professor

## Regras críticas

1. **Aprovar folha ≠ pagar.** Valores ficam imutáveis após `approved`.
2. **Autorizar ordem ≠ executar transferência.** Controlo duplo por omissão (`require_dual_control`).
3. Saída `Salários` em `siga_cash_expenses` só após confirmação `paid` do item.
4. Falha de pagamento **não** cria saída de caixa.
5. Horário programado **não** prova aula; falta automática nasce `pending`.
6. Token QR bruto **nunca** persistido — só `token_hash`.
7. Compensação de aula só fica `validated` com evidência `check_out` `auto_approve`
   (gate `hr_gate_teacher_compensation_by_assurance` + hardening `20260906190000`).
8. Escrita SGA: `loadSgaAdminClient` + roles Admin/Tesouraria nos server fns.
9. SQL SGA: bloco Ciclo 56 em `APPLY_ENROLLMENT_AND_PREMIUM.sql` (+ migrations `20260906*_hr_*`).

## Fora de âmbito (ainda)

Integração bancária real, webhooks, WebAuthn/App Attest, IRT/INSS definitivo,
holerite oficial, scheduler diário de materialização.

## Inventário

`scripts/siga/modules.json` → id `rh`, skill `siga-rh`, accessKey `financeiro`.
