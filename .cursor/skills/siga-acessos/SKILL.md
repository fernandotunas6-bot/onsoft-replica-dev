---
name: siga-acessos
description: >-
  Extends SIGA accounts, module grants and TOTP 2FA. Use when editing
  /acessos, AuthGate MFA, staff_module_grants, or access-policy.
---

# SIGA · Acessos e 2FA

- Rotas: `acessos.tsx`, `alterar-senha.tsx`
- Política: `src/features/auth/access-policy.ts` (`moduleForPath`: `/` é exacto)
- Grants: `src/features/access/grants.ts` → `staff_module_grants`
- Login MFA: `src/components/auth/AuthGate.tsx`
- Enrol TOTP: `SecurityPanel` em `settings-panels.tsx`
- Testes: `tests/auth/access-policy.test.ts`

## Regras

1. Grants sobrepõem o cargo. `Nenhum` bloqueia o módulo — no browser (`canAccessPath`) **e no servidor**: as funções de cada módulo usam `requireSgaWriterFor("<módulo>", …)` (pasta → módulo em `tests/security/module-grant-enforcement.test.ts`). Funções que alteram dados usam `requireSgaWriterForWrite` (bloqueia também "Leitura"); leituras usam `requireSgaWriterFor`. A gestão de acessos fica de fora do bloqueio, para o administrador não se trancar a si próprio.
2. Sem tabela de grants: `getCurrentAccountContext` devolve `{}`.
3. 2FA = Supabase Auth MFA TOTP. Sem factor próprio.
4. Só Admin gere contas e grants.
5. **Reenviar** gera link Auth (`invite` se ainda não confirmou, `recovery` se já entrou) e copia-o. Sem SMTP próprio. Com WhatsApp/Resend instalados, a linha também oferece **WhatsApp** e **E-mail** (mailto + texto copiado). **Credenciais** imprime a folha de acesso do colaborador. Listas filtradas têm **Oficial contas** e **Oficial equipa**. A página tem toolbar `InstalledModuleTools module="comunicacoes"`. Definições → Segurança aponta convites Resend para esta rota.
6. **Vinculação institucional:** conta sem vínculo → `InstitutionOnboarding` (via `RouteAccessGate`). Pedidos em `school_access_requests`, servidor em `src/features/access/requests-server.ts`, regras puras em `institutional-link.ts`, fila em `AccessRequestsPanel` (topo de `/acessos`). A aprovação cria só membership + papel; nunca "Administrador"; Secretaria/Tesouraria só por Administrador. Testes: `tests/access/institutional-link.test.ts`.
7. **Contas partilhadas entre escolas:** a identidade (auth.users) é uma só. `resetStaffPasswordDirect`, o bloqueio global de `setSystemAccountDisabled`, o cargo global de `updateSystemAccountCargo` e o link copiado de `resendSystemInvite` (que abre a conta a quem o tiver) passam por `otherSchoolAccess`: com outra escola activa, ou se a pessoa for administradora em qualquer escola, a acção fica limitada a esta escola ou é feita por "Enviar E-mail". A Secretaria não copia links de pessoal administrativo. Cada link copiado fica em `audit_logs` (`access.link_copied`).
