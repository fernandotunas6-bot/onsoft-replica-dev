# SIGA Plus — cargo Administrador sem 2FA obrigatório (29/10/2026)

## Decisão e âmbito

Atribuir o cargo **Administrador da escola** não deve exigir uma sessão `aal2`
nem obrigar à instalação de um autenticador. A preferência voluntária para
pedir código **no início de sessão** já existe (`LOGIN_MFA_OPT_IN_2026-10-27.md`).
Este incremento trata especificamente da atribuição de cargo e da
facilidade de configuração pela própria pessoa.

**Não** significa remover as protecções de outras operações sensíveis.

## Contrato

| Fluxo | Sem TOTP (AAL1) | Garantias preservadas |
| --- | --- | --- |
| Criar conta de Administrador | Permitido | Administrador da escola + reconfirmação recente + auditoria |
| Mudar cargo para Administrador | Permitido | Administrador da escola + reconfirmação recente + isolamento por escola + auditoria |
| Convidar Administrador | Permitido | Administrador da escola + reconfirmação recente + convite limitado à escola |
| Criar/atribuir/convidar Tesouraria | Ainda exige AAL2 | Autorização + AAL2 + requisitos anteriores |
| Aprovar pedido institucional | Nunca concede Administrador | `canGrantRole` mantém a lista de papéis permitidos; Tesouraria mantém AAL2 |
| Conceder grants de módulos, dinheiro/RH, redefinição directa de senha | Não alterado | Guardas MFA e RLS pré-existentes mantidos |

A confirmação recente usa o mecanismo existente `requireRecentVerification`
(janela de 15 minutos, com senha para contas sem 2FA), de modo que não seja
necessária uma aplicação de códigos para gerir os cargos de Administrador.

## Local para activar voluntariamente

- **Definições → Segurança** e **Meu Perfil** reutilizam `MfaSecurityPanel`
  e `LoginMfaSetting`.
- O primeiro painel explica cinco passos simples e dá acesso às páginas de
  instalação do Google Authenticator (Android / iPhone) e Microsoft Authenticator
  (Android / iPhone).
- O utilizador configura o autenticador, lê o QR, confirma um código de seis
  números e só depois, se desejar, activa **Código ao iniciar sessão**.
- Não se adiciona um segundo painel, outro fluxo de enrolamento, tabela ou
  nova preferência. Factores já inscritos não são apagados.

## Ficheiros

- `src/features/access/server.ts`
- `src/features/access/requests-server.ts`
- `src/features/auth/MfaSecurityPanel.tsx`
- `src/features/auth/LoginMfaSetting.tsx`
- `tests/access/elevated-role-aal2.test.ts`

## Verificações antes do deploy

1. Executar `npm run typecheck`, Vitest (`tests/access/elevated-role-aal2.test.ts`,
   `tests/access/grants-mfa.test.ts`, `tests/security/step-up.test.ts`) e build.
2. Em staging, testar conta AAL1 de administrador: criar, mudar cargo e
   convidar outro administrador após confirmação recente.
3. Testar Secretaria a tentar conceder Administrador (deve ser recusado);
   escola A a tentar alterar cargo de utilizador de outra escola (recusa).
4. Testar Tesouraria AAL1 (deve continuar recusada com 2FA), contas financeiras,
   e grants de módulo AAL1.
5. Verificar abertura dos links oficiais, QR e introdução dos seis dígitos em
   Android, iPhone, desktop e ecrãs pequenos. Não usar contas reais de escolas
   em testes com alterações.
6. Só efectuar merge/deploy após CI e QA autenticada. Não é necessária migração SQL.

## Risco e reversão

Remover AAL2 da atribuição do Administrador reduz a resistência à tomada de
controlo se a senha do administrador for comprometida; a reconfirmação de
identidade, RBAC e auditoria mitigam, mas não eliminam, o risco. Reverter o PR
restaura a exigência anterior sem apagar factores nem alterar a base de dados.
