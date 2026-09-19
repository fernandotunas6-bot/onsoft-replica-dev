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
| `/professor/presenca` | Professor | Check-in/out QR + chamada de alunos |

## Fluxo professor (telemóvel / tablet)

1. Secretaria gera QR de check-in em `/financeiro/rh`.
2. Professor autentica-se e lê o QR em `/professor/presenca` (câmara ou colar código).
3. `resolveAuthenticatedTeacherId` liga o login à ficha `teachers`
   (`user_id` → `people.user_id` → email) e faz backfill de `teachers.user_id`.
4. Após check-in válido, `ensureAttendanceSessionForOccurrence` cria/reutiliza
   `siga_attendance_sessions` e devolve `classroom` (turma, disciplina, sessão).
5. A UI abre `AttendanceCallDialog` em ecrã cheio (mobile) com a lista de alunos
   para marcar presença/falta/atraso/justificada no aparelho.
6. Deep-link: `?chamada=1&turma=&disciplina=&sessao=&data=` reabre a chamada.
7. **56.3** Lista «Minhas aulas» mostra turma/disciplina; «Abrir chamada» sem
   novo QR via `openMyLessonClassroom` (exige check-in prévio).
8. **56.4** Portal do professor (`TeacherPortalDashboard`) tem CTA «Assinar
   presença (QR)» no cabeçalho, nas aulas de hoje e no menu de ferramentas.
9. **56.5** Check-out explícito: banner «aula em curso», modo Entrada/Saída e
   botão «Ler QR de saída» quando falta `actual_ended_at`.
10. **56.6** Após chamada: «Lançar notas» / «Pauta» → `/pedagogica?tab=notas&turma=&disciplina=&pauta=1`
    (diálogo de chamada, portal e painel QR).
11. **56.7** Plano + Materiais da turma no mesmo fluxo (`teacher-classroom-links.ts`):
    `/planos-aula?turma=&disciplina=` e `/arquivos?turma=`.
12. **57.10–57.11** Agenda → Chamada/QR: `agendaLessonActions` + `teacherQrPresenceSearch`
    (`/professor/presenca?turma=&disciplina=&data=`); painel destaca `focusLesson`.
    Chamada aceita `dia` em `/pedagogica`.

## Domínio

- `schemas.ts` — contratos + máquina de estados
- `server.ts` — dashboard e listagens base
- `payroll.ts` — competência, cálculo, aprovação
- `payments.ts` — lotes, autorização, confirmação → caixa
- `absences.ts` — faltas funcionais
- `teacher-lessons.ts` — ocorrências + QR + handoff + `openMyLessonClassroom`
- `attendance-assurance.ts` — geofence / score
- `teacher-lesson-exceptions.ts` — substituição / aula extra / política de tolerância
- `materialize-lessons.ts` — sincronizar aulas do horário
- `TeacherAttendancePanel.tsx` — UI professor (QR → chamada → check-out; `focusLesson` da agenda)
- `teacher-classroom-links.ts` — deep-links notas / plano / materiais / chamada / QR agenda

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
