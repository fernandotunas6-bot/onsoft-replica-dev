# SIGA Plus — verificação opcional no início de sessão (27/10/2026)

## Decisão do proprietário

Retirar o pedido geral de 6 dígitos no início de sessão, incluindo contas que já
tinham TOTP ou chave de acesso configurados. Conservar configuração uma só vez e
activação voluntária por conta em **Definições → Segurança** ou **Perfil**.

## Contrato implementado

| Fluxo | Comportamento |
| --- | --- |
| Login de conta sem preferência explícita | Sessão `aal1` aceite, com ou sem factores previamente inscritos |
| Login após activar a opção | Se há factor verificado, requer `aal2` na UI e no middleware |
| Activar/desactivar | Acção autenticada e com verificação recente; apenas a própria conta |
| Configurar TOTP/passkey | Inscreve factor Supabase; **não** activa automaticamente o desafio de login |
| Escolas e painéis | Uma preferência no `auth.users.app_metadata`, não uma opção por escola |
| Operações críticas | Permanecem os guardas `aal2` e step-up de 15 minutos pré-existentes |

Campo reservado em `app_metadata`: `siga_login_mfa_enabled` (booleano).
Ausente/nulo/qualquer valor diferente de `true` = **desligado**. Não é necessária
migração SQL nem alteração de RLS. Os factores inscritos existentes **não são
eliminados**, para continuarem disponíveis em operações críticas.

## Mapa de alterações

- `src/features/auth/login-mfa-policy.ts`: preferência pura, valor inicial seguro e estável.
- `src/features/auth/login-mfa-server.ts`: grava a opção na identidade do próprio utilizador.
- `src/features/auth/pending-mfa.ts`: desafio no login só quando activado.
- `src/integrations/supabase/session-mfa.ts`: o servidor aplica a mesma escolha.
- `src/features/auth/MfaSecurityPanel.tsx`, `LoginMfaSetting.tsx` e `PasskeysPanel.tsx`:
  configurar uma vez, activar/desactivar e gerir dispositivos.
- `src/features/school/settings-security-panel.tsx` e `ProfileSettingsPanel.tsx`:
  reutilizam os mesmos painéis; sem duplicar o enrolamento TOTP.
- `src/components/auth/AuthGate.tsx`: dispositivo reconhecido só quando a
  confirmação no login está activada; não confundir isto com step-up.

## Segurança e efeitos esperados

Esta decisão **reduz deliberadamente a protecção das sessões comuns**: quem
obtenha a senha de uma conta com a opção desligada pode navegar sem segundo
factor. Os factores já configurados não substituem a activação voluntária.
Administradores da plataforma e escritas financeiras/académicas sensíveis
continuam limitados pelos requisitos `aal2` existentes, e podem pedir código
na altura da operação. Não remover estes guardas como efeito colateral.

### Matriz de validação

| Cenário | Estado antes da homologação |
| --- | --- |
| Utilizador antigo com TOTP, entrada Google/senha/BI | Por validar com conta autorizada |
| Sem factor e sem preferência | Por validar com conta autorizada |
| Activar opção com TOTP verificado; reiniciar sessão | Por validar com conta autorizada |
| Desactivar com confirmação recente; iniciar sessão de novo | Por validar com conta autorizada |
| Outra escola / outro dispositivo, mesma conta | Por validar com duas escolas |
| Operação financeira sem `aal2`, tentativa de bypass | Por validar em staging |
| Chave de acesso, navegador sem suporte, código alternativo | Por validar em dispositivos reais |

### Rollback

Reverter o commit/PR deste incremento repõe a exigência anterior baseada na
existência de factores. Como os factores não foram eliminados, a reversão
restaura a política de login sem migração de dados. As preferências no
`app_metadata` ficam inertes na versão anterior, sem apagar atributos
institucionais ou autorizações de outros sistemas.
