# SIGA Plus — modelos de autenticação premium (Supabase Auth)

Projeto Supabase: `xodgfmxiaunpamctfeea` | Aplicação: https://portal-siga.com

> Estes modelos estão versionados no GitHub, mas **não são instalados automaticamente no serviço Supabase hospedado**. Aplicar em Authentication → Email Templates, depois de configurar URLs e SMTP. Não armazenar passwords, secrets ou tokens pessoais neste repositório.

## Mapa de instalação

| Ficheiro | Modelo no painel | Assunto |
|---|---|---|
| `confirm-sign-up.html` | Confirm sign up | SIGA Plus — Confirme o seu e-mail |
| `invite-user.html` | Invite user | SIGA Plus — O seu convite institucional |
| `magic-link-or-otp.html` | Magic link / OTP | SIGA Plus — Acesso temporário à sua conta |
| `change-email-address.html` | Change email address | SIGA Plus — Confirme o novo endereço |
| `reset-password.html` | Reset password | SIGA Plus — Redefina a sua palavra-passe |
| `reauthentication.html` | Reauthentication | SIGA Plus — Código de segurança |

Todos os modelos usam tabelas para ampla compatibilidade entre leitores de e-mail, estilos inline, títulos descritivos, CTA único quando aplicável e avisos de segurança. Não dependem de imagens remotas. URLs e códigos sensíveis são gerados pelo Supabase:
- Confirmar, convite, alterar e redefinir: `{{ .ConfirmationURL }}`.
- Link mágico/OTP: `{{ .ConfirmationURL }}` e `{{ .Token }}`; **só ativar a visualização do código se o frontend disponibilizar a introdução de OTP**.
- Alteração de endereço: `{{ .NewEmail }}`.
- Reautenticação: `{{ .Token }}`.

## Pré-requisitos críticos
1. Authentication → URL Configuration: definir Site URL `https://portal-siga.com` e adicionar **apenas** os redirect URLs implementados. Se PKCE/SSR, validar a rota de confirmação e `exchangeCodeForSession`; não mudar templates para `TokenHash` até comprovar a implementação.
2. Authentication → Providers: habilitar e-mail, verificar que **Confirm email** está ativado, rever rate limits e não desabilitar cadastros antes de confirmar convites, criação de utilizadores e testes. A confirmação do e-mail não implica acesso à instituição: revalidar vínculos ativos e MFA conforme perfil.
3. Authentication → SMTP Settings: configurar um serviço SMTP transacional **com credenciais obtidas e inseridas apenas no painel/secret manager**. Dados necessários: host, porta/TLS, utilizador, password, e-mail remetente previamente verificado e nome `SIGA Plus`. O endereço `no-reply@portal-siga.com` é **proposta, não uma caixa ou domínio remetente confirmado**. Não afirmar que o SMTP está configurado até comprovar envio real.
4. DNS: obter do provedor SMTP os registos de verificação e DKIM específicos. Verificar SPF (um único TXT SPF por nome remetente), DKIM (selector do provedor) e DMARC (iniciar com política de monitorização, quando apropriado) no DNS autoritativo. Evitar inventar valores ou adicionar registos genéricos sem conhecer o provedor.
5. Authentication → Email Templates: colar assunto/HTML e guardar cada modelo individualmente; nunca substituir links por URLs fixos do frontend.
6. Testar com contas de teste autorizadas: cadastro não confirmado, confirmação, convite em aberto/expirado/usado, magic link/OTP correto e incorreto, pedido de mudança de e-mail com nova confirmação, redefinição, reautenticação correta/incorreta/expirada. Validar entrega, SPF/DKIM/DMARC em cabeçalhos, redirecionamento, limites e ausência de acesso escolar sem vínculo.

## Critérios de aceite
- Testes estáticos: todos os ficheiros HTML existem, contêm `lang="pt"`, viewport, cabeçalhos, mensagens de segurança e as variáveis Supabase adequadas; os ficheiros não contêm chaves nem imagens remotas.
- Testes reais: **não realizados até publicação no painel e configuração do SMTP**. Não tentar usar tokens de produção ou enviar e-mails reais a utilizadores sem consentimento.
- Mudança de e-mail, alteração de password e vinculação Google exigem atenção especial: confirmar política de MFA, persistência de sessão e alterações de perfil apenas em campos permitidos.
- Identificar a origem dos retornos do sistema: o link de verificação expira e pode dar erro quando um gateway ou scanner de e-mail o consome primeiro; não afirmar que o template resolve problemas de entrega/transporte.

Referências:
- https://supabase.com/docs/guides/auth/auth-email-templates
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/docs/guides/auth/redirect-urls

## Atualização segura da configuração alojada

Depois de revogar os tokens administrativos previamente partilhados, utilizar uma **nova** credencial de gestão apenas no ambiente privado do operador. O instalador faz comparação read-only, exige confirmação explícita e agora **exige guardar uma cópia local dos modelos anteriores** antes de alterar a configuração. A cópia inclui apenas os campos de modelos/assuntos e eventuais opções de confirmação escolhidas, nunca a palavra-passe SMTP nem o token administrativo.

```bash
python supabase/email-templates/deploy.py
SUPABASE_ACCESS_TOKEN=... python supabase/email-templates/deploy.py --check
SUPABASE_ACCESS_TOKEN=... python supabase/email-templates/deploy.py --apply --confirm-production --backup-dir ./private-auth-backups
```

O diretório de cópias deve ficar **fora do repositório Git** e protegido por permissões de sistema. A ativação de `--secure-email` é uma operação separada que exige uma revisão dos fluxos de cadastro, OAuth e mudança de e-mail antes da publicação. Não enviar as credenciais pelo chat nem incorporá-las no workflow do GitHub.
