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

1. Grants sobrepõem o cargo. `Nenhum` bloqueia o módulo.
2. Sem tabela de grants: `getCurrentAccountContext` devolve `{}`.
3. 2FA = Supabase Auth MFA TOTP. Sem factor próprio.
4. Só Admin gere contas e grants.
5. **Reenviar** gera link Auth (`invite` se ainda não confirmou, `recovery` se já entrou) e copia-o. Sem SMTP próprio. Com WhatsApp/Resend instalados, a linha também oferece **WhatsApp** e **E-mail** (mailto + texto copiado). **Credenciais** imprime a folha de acesso do colaborador. Listas filtradas têm **Oficial contas** e **Oficial equipa**. A página tem toolbar `InstalledModuleTools module="comunicacoes"`. Definições → Segurança aponta convites Resend para esta rota.
