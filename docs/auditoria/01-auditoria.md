# Auditoria SIGA Plus — 1. Autenticação e segurança

**Data:** 2026-09-23 · **Âmbito:** apenas a área 1 · **Código não alterado.**

Base factual: suite completa a correr nesta data — **251 ficheiros, 1712 testes, 0 falhas**
(2 ficheiros e 3 testes saltados). Dos testes, 17 correm **contra a produção**
(`rls-live-probe`, `selects-vs-producao-live`). Sondagens adicionais feitas com a chave
anónima, só leitura.

Nota de método: «tem testes verdes» não é «funciona em produção». Cada ponto abaixo diz qual
dos dois se verificou.

---

## 1.1 Métodos de login, sessões e encerramento

**Implementado.** Quatro vias, todas em `src/components/auth/AuthGate.tsx`:
senha (`:307`), Nº de BI/NIF resolvido para e-mail (`:299-300`, via
`features/access/server.ts`), link mágico sem senha (`features/auth/magic-link-server.ts`)
e Google OAuth (`:396`) com verificação pós-login de associação a escola (`:185-201`) —
uma conta Google sem escola é apagada no servidor e a sessão local limpa.

Sessão: expiração por inactividade de 30 minutos (`:30`), com actividade seguida por
eventos de teclado/ponteiro e sincronizada entre separadores por `storage` (`:264-289`).

**Lacuna (P2):** não existe encerramento de sessão **em todos os dispositivos**. As três
chamadas a `signOut` usam `scope: "local"` (`:192`, `:206`, `:252`); não há nenhuma
`scope: "global"` no repositório. Quem suspeite de conta comprometida não tem como expulsar
as outras sessões.

## 1.2 Recuperação de senha

**Implementado e sólido.** Resposta neutra que não revela se a conta existe
(`features/auth/reset-password-server.ts:76`), limite de tentativas (`:88`), e OTP com
**expiração de 5 minutos** e **uso único** — `consumed_at` é marcado antes de emitir novo
código e a consulta filtra `.is("consumed_at", null)` (`features/otp/otp-service.ts:65`,
`:72-75`). Testes: `tests/auth/reset-password.test.ts`, `reset-password-otp.test.ts`.

Corrigido num ciclo anterior e confirmado hoje: a via por e-mail consultava `profiles.email`,
coluna inexistente, e caía sempre no varrimento completo de utilizadores. Hoje resolve por
`people.user_id` (`reset-password-otp-server.ts:55-67`).

**Não verificado:** identidade visual institucional dos e-mails (exige inspecção do
template enviado).

## 1.3 MFA/2FA, força bruta e enumeração

**Implementado.** TOTP com desafio e verificação, e recusa se a sessão não subir a AAL2
(`AuthGate.tsx:313-315`, `:514-534`). Do lado do servidor a exigência é real e não
decorativa: `private.is_aal2()` aparece **50 vezes** nas funções de produção
(`supabase/migrations/20260908210000_capture_all_db_functions.sql`), incluindo
`register_payment` e `register_student`.

Enumeração: mensagem de login genérica (`AuthGate.tsx:45-46`).

**Lacuna (P2):** o `signInWithPassword` é chamado directamente do cliente e **não tem
limite de tentativas da aplicação** — `checkRateLimit` cobre link mágico
(`magic-link-server.ts:55`), recuperação (`reset-password-server.ts:88`), consulta por BI
(`access/server.ts:574`) e OTP (`otp-dispatcher.ts:88`), mas não o login por senha. A
protecção depende inteiramente dos limites do Supabase, que não estão declarados aqui.

## 1.4 RBAC

**Implementado, com granularidade nos dois lados.** Sete perfis em
`src/features/auth/permissions.ts:73-150` (Administrador, Secretaria, Tesouraria,
Professor, Encarregado, Aluno e o padrão). Na base existem `roles`, `permissions`,
`role_permissions`, `member_roles` e `person_roles`, e as funções privilegiadas verificam
`private.has_permission(school_id, 'recurso.accao')` — não o papel. Testes:
`tests/auth/permissions.test.ts`, `portal-engine.test.ts`, `multi-school-memberships.test.ts`.

## 1.5 Isolamento multi-tenant

**Verificado contra a produção:** 156 de 156 tabelas com RLS activa, 296 políticas, e o
probe anónimo confirma que alunos, pessoas, finanças e segredos devolvem `42501`.

**Achado (P1): a superfície alcançável pelo papel anónimo é de 98 das 156 tabelas.**
Sondei seis fora da lista do probe (`person_documents`, `siga_files`,
`siga_assessment_scores`, `hr_payroll_items`, `platform_admins`, `verification_otps`):
**nenhuma devolveu dados**, mas todas **aceitaram a consulta** em vez de recusarem por falta
de privilégio. A diferença importa — o que as protege é a correcção de cada política RLS,
não a ausência de concessão. Uma política mal escrita passa a fuga imediata, e o
`rls-live-probe` só cobre **12** destas 98.

**Não verificado:** políticas de Storage por tenant (há SQL de buckets em
`supabase/migrations/20260810140500_profile_avatar.sql`, não auditado), e isolamento de
cache entre tenants.

## 1.6 Acesso por alteração de URL, IDs ou parâmetros

**Implementado.** `tests/security/api-route-guards.test.ts` inspecciona cada ficheiro de
rota individualmente, com limiar mínimo de rotas encontradas. As server functions exigem
`requireSupabaseAuth` e resolvem a escola pela sessão, não por parâmetro. `RouteAccessGate`
e `features/auth/access-policy.ts` cobrem o lado do cliente.

## 1.7 Auditoria e protecção de segredos

**Implementado, e reparado há pouco.** Existem 16 tabelas de auditoria/eventos, incluindo
`audit_logs`, `saas_audit_logs`, `finance_invoice_events`, `student_status_events` e
`alumni_privacy_audit`.

Importa registar que **até há dias a auditoria de autenticação não gravava uma única
linha**: `saas_audit_logs` era escrita com `entity_type`/`actor_id`, colunas que não
existem, dentro de `catch` silenciosos — em seis ficheiros. O mesmo em `audit_logs` para
mudanças de estado de aluno. Corrigido e coberto por
`tests/security/colunas-inexistentes.test.ts`, que agora verifica escritas além de leituras.

Segredos: as chaves deixaram de ir como `vars` em texto simples para o worker
(`tests/security/deploy-sem-segredos-em-vars.test.ts`); verificado hoje que não aparecem em
nenhum dos 73 bundles de cliente nem no HTML.

---

## Classificação

| Sev. | Achado | Onde |
|---|---|---|
| **P1** | 98 de 156 tabelas aceitam consulta do papel anónimo; protegidas só por RLS, e o probe cobre 12 | produção |
| **P2** | Sem encerramento de sessão em todos os dispositivos | `AuthGate.tsx:192,206,252` |
| **P2** | Login por senha sem limite de tentativas da aplicação | `AuthGate.tsx:307` |
| **P3** | Identidade visual dos e-mails transaccionais não verificada | — |
| **P3** | Políticas de Storage e isolamento de cache não auditados | — |

**P0: nenhum.** Não foi encontrada fuga de dados nem via de acesso não autorizado.
