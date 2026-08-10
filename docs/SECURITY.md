# Relatório de Segurança — SIGA

Última verificação: 2026-08-10 (scan completo do backend + auditoria de dependências).

## 1. Resultado do scan completo

| Verificação | Ferramenta | Resultado |
| --- | --- | --- |
| Backend (RLS, exposição de dados, configuração) | scanner de segurança Lovable | **0 problemas** |
| Dependências npm (alta/crítica) | `npm audit` / `bun audit` | **0 vulnerabilidades altas ou críticas** |
| Findings anteriores | — | `app_user_connections_no_policies` corrigido e validado |

## 2. Row Level Security — regras aplicadas actualmente

### `public.profiles`
- RLS: **activo**
- `SELECT` — role `authenticated`, `USING (auth.uid() = id)`
- `INSERT` — role `authenticated`, `WITH CHECK (auth.uid() = id)`
- `UPDATE` — role `authenticated`, `USING (auth.uid() = id)` e `WITH CHECK (auth.uid() = id)`
- Sem acesso para `anon`: um visitante não autenticado não lê nem escreve perfis.
- Cada perfil é criado pelo trigger `on_auth_user_created`, ligado ao `id` do utilizador em `auth.users`.

### `public.app_user_connections` (credenciais de conectores por utilizador)
- RLS: **activo e forçado** (`FORCE ROW LEVEL SECURITY`) — nem o dono da tabela contorna as políticas.
- Política única `No client access to connection credentials`
  - comandos: `ALL`
  - roles: `anon`, `authenticated`
  - `USING (false)` e `WITH CHECK (false)` → **negação total no cliente**
- Acesso apenas através do `service_role`, usado exclusivamente em server functions.

## 3. Protecção das credenciais de conectores

- A chave de ligação (`lovack_*`) nunca chega ao browser: é trocada no servidor a partir de um código de uso único.
- É guardada **cifrada** (AES-256-GCM) na coluna `connection_key_ciphertext`; a chave de cifra vive só no ambiente do servidor (`APP_USER_CONNECTION_KEY_SECRET`).
- Leitura/escrita apenas via cliente `service_role` dentro de server functions; o `anon` e o `authenticated` não têm privilégios na tabela.
- Ao desligar um conector, a linha correspondente é eliminada.

## 4. Invariantes de segurança (o que nunca deve acontecer)

1. Nenhum cliente do browser deve conseguir ler `app_user_connections`.
2. Nenhum utilizador deve ler ou alterar o perfil de outro utilizador.
3. Segredos do servidor (chaves de serviço, chave de cifra, `LOVABLE_API_KEY`) nunca são registados, devolvidos numa resposta, nem usados em código do browser.
4. Qualquer tabela nova em `public` tem de nascer com `GRANT` explícito + RLS + políticas.

## 5. Automação em CI

- **`bun audit --audit-level=high`** em cada push e pull request: o build falha se entrar um pacote com vulnerabilidade alta/crítica.
- **Scan semanal agendado** (segundas, 04:00 UTC): repete a auditoria de dependências, gera `reports/security/*` e publica como artefacto; falha se surgirem novos problemas.
- Relatórios anteriores ficam disponíveis nos artefactos de cada execução.
