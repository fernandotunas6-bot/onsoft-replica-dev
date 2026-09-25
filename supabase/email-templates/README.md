# SIGA Plus — templates de e-mail do Supabase Auth

Projeto: `xodgfmxiaunpamctfeea` · URL: https://portal-siga.com

Os seis ficheiros HTML deste diretório são modelos para **Authentication → Email Templates** no painel Supabase. **Versionar estes ficheiros não altera os templates ativos do serviço alojado.** Os conteúdos têm de ser aplicados no Dashboard ou por uma integração de configuração autorizada. Não utilizar `execute_sql` para editar `auth.config` nem inserir segredos em SQL ou neste repositório.

| Template | Assunto |
|---|---|
| `confirm-sign-up.html` | SIGA Plus | Confirme o seu e-mail |
| `invite-user.html` | SIGA Plus | Convite para utilizar o sistema |
| `magic-link-or-otp.html` | SIGA Plus | Acesso temporário à sua conta |
| `change-email-address.html` | SIGA Plus | Confirme o seu novo e-mail |
| `reset-password.html` | SIGA Plus | Redefina a sua palavra-passe |
| `reauthentication.html` | SIGA Plus | Código de segurança |

## Instalação
1. Confirmar em Authentication → URL Configuration que o Site URL é https://portal-siga.com e adicionar apenas os redirect URLs efetivamente implementados.
2. Confirmar que **Email** está ativo e que **Confirm email** está ligado. Não desativar novos cadastros antes de testar os fluxos de convite.
3. Em Authentication → Email Templates, colar o assunto e o HTML de cada ficheiro na secção com o mesmo nome.
4. Configurar SMTP autorizado com remetente verificado, SPF, DKIM e DMARC. Nunca enviar chaves ou palavras-passe SMTP para este repositório.
5. Testar os seis fluxos numa conta de testes, incluindo ligação expirada, utilização repetida, reautenticação e recuperação de senha, antes de disponibilizar em produção.

Os modelos utilizam as variáveis oficiais `{{ .ConfirmationURL }}`, `{{ .Token }}` e `{{ .NewEmail }}`. Os URLs de confirmação são gerados pelo Supabase, não por um redirecionamento fixo no HTML. O modelo de reautenticação utiliza somente `{{ .Token }}`. Se o frontend utilizar PKCE/SSR, implementar e testar as rotas de confirmação e troca de código antes de alterar os templates.

A confirmação do endereço de e-mail prova controlo do endereço, não atribui instituição ou cargo. O backend deve consultar os vínculos escolares ativos e as permissões da conta.
