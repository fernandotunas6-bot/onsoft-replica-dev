# SIGA Plus — notificações de segurança de conta

Estes quatro modelos complementam os **seis modelos de autenticação** em `../`. Estão versionados, mas **não estão ativados no Supabase**. Os alertas nativos de segurança do Supabase só são enviados após ativar individualmente cada notificação no projeto.

| Ficheiro | Notificação no Supabase | Assunto sugerido | Variáveis |
|---|---|---|---|
| `password-changed.html` | Password changed | SIGA Plus — A sua palavra-passe foi alterada | Nenhuma obrigatória |
| `email-changed.html` | Email address changed | SIGA Plus — O e-mail da sua conta foi alterado | `{{ .OldEmail }}`, `{{ .Email }}` |
| `identity-linked.html` | Sign-in method linked | SIGA Plus — Novo método de entrada associado | `{{ .Provider }}` |
| `identity-unlinked.html` | Sign-in method removed | SIGA Plus — Um método de entrada foi removido | `{{ .Provider }}` |

## Regras de publicação e privacidade
1. Rever Authentication → Email Templates → Security notifications. Substituir o corpo e o assunto da notificação correta e ativar **apenas** os alertas desejados.
2. Confirmar que o SMTP transacional, a verificação do domínio e os URLs da aplicação estão corretos antes da ativação.
3. Os e-mails informam o utilizador sobre eventos que **já ocorreram**; não atribuem vínculo escolar, cargo, sessão nem permissões. Nunca incluir credenciais ou dados pessoais adicionais.
4. Os modelos não contêm links de recuperação automática para evitar instruir a utilização de um caminho que ainda não esteja implementado. Para recuperar uma conta, o utilizador deve abrir diretamente o portal oficial.
5. Validar com contas de teste: evento legítimo, evento não reconhecido, entrega a um endereço confirmado, identificação correta do provedor, atraso/repetição de notificações, SPF/DKIM/DMARC e ausência de fugas de dados.

**Importante:** este pacote ainda não habilita estes eventos. Os seis modelos de login em `../` continuam a ser instalados separadamente pelo script `deploy.py`; não alterar o deploy para ativar notificações de segurança enquanto o SMTP e os testes reais não estiverem concluídos.

Documentação: https://supabase.com/docs/guides/auth/auth-email-templates
