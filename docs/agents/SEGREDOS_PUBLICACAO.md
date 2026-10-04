# Segredos de publicação — o que falta criar no GitHub

Levantado a 2026-10-04 pela API do GitHub. **Estado: não há nada configurado.**

```
repositório → secrets: 0   variables: 0
ambiente "production" → secrets: 0   variables: 0
```

Não é que faltem cinco: falta tudo. É por isso que o `deploy-production.yml`
nunca publicou nada e que os jobs de E2E, Lighthouse e alerta aparecem a
`skipping` no CI — saltam sozinhos quando não encontram os segredos.

## Onde se põem

O job `deploy` do `deploy-production.yml` declara `environment: production`, por
isso os segredos têm de ir ao **ambiente**, não só ao repositório:

> Settings → Environments → **production** → Environment secrets → *Add secret*

As `vars` (configuração que não é segredo) vão no mesmo ecrã, em *Environment
variables*.

## 1. Os três que travam a publicação

O workflow tem um passo de pré-voo (linhas 63–77) que falha em segundos a dizer
o nome do que falta. Verifica cinco nomes, mas dois têm valor por omissão no
próprio workflow, por serem públicos. Sem estes três, nada chega à Cloudflare:

| Segredo | Onde se obtém |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens → *Create Token*. Precisa de **Edit Cloudflare Workers** e, para as Pages, **Account → Cloudflare Pages → Edit**. |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare → Workers & Pages → barra lateral direita, *Account ID*. Não é propriamente secreto — também serve como `vars.CLOUDFLARE_ACCOUNT_ID`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → *service_role*. O workflow aceita `SUPABASE_SECRET_KEY` no lugar dela. |

> **Rodar a chave de serviço antes de a colar.** A `service_role` do projecto
> foi exposta num chat a 2026-10-04 (é o segundo caso deste padrão). Gerar uma
> nova no painel do Supabase **antes** de a guardar como segredo; a antiga passa
> a ser pública para efeitos práticos.

Os outros dois do pré-voo — `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`
— já têm omissão no workflow (`https://xodgfmxiaunpamctfeea.supabase.co` e a
chave publicável), as mesmas de `src/integrations/supabase/client.ts`. São
públicas e vão no bundle de qualquer modo. Só vale a pena defini-las para deixar
de depender de um valor escrito à mão no YAML.

## 2. Os que o servidor precisa em execução

Estes não travam a publicação: o `scripts/worker-secrets.mjs` tem só
`SUPABASE_SERVICE_ROLE_KEY` como obrigatório e trata os restantes como
opcionais — vazios não são enviados, e `keep_vars` mantém o que já estiver no
painel da Cloudflare. **Mas a funcionalidade que depende de cada um fica morta
em produção até o segredo existir.**

**Base de dados e sessão**
`SUPABASE_SECRET_KEY` · `SUPABASE_JWT_SECRET` · `OTP_PEPPER_SECRET` · `SIGA_CRON_SECRET`

**Pagamentos (AppyPay, PayFlow)**
`APPYPAY_CLIENT_SECRET` · `APPYPAY_WEBHOOK_TOKEN` · `PAYFLOW_SSO_SECRET` · `PAYFLOW_INTEGRATION_API_KEY`

**E-mail (Resend, Zoho)**
`RESEND_API_KEY` · `RESEND_WEBHOOK_SECRET` · `ZOHO_MAIL_CLIENT_SECRET` · `ZOHO_MAIL_REFRESH_TOKEN`

**SMS e WhatsApp (Twilio, Meta)**
`SMS_API_KEY` · `TWILIO_ACCOUNT_SID` · `TWILIO_AUTH_TOKEN` · `TWILIO_FROM_NUMBER` · `TWILIO_WEBHOOK_AUTH_TOKEN` · `WHATSAPP_ACCESS_TOKEN` · `WHATSAPP_CLOUD_TOKEN` · `WHATSAPP_WEBHOOK_VERIFY_TOKEN` · `META_APP_SECRET`

**Google, Zoom, Lovable**
`GOOGLE_SERVICE_ACCOUNT_KEY` · `GOOGLE_OAUTH_TOKEN` · `ZOOM_CLIENT_SECRET` · `LOVABLE_API_KEY`

> O segredo do Google OAuth também foi exposto num chat (25/09). Rodar antes de
> o guardar.

**Captcha** — `HCAPTCHA_SECRET_KEY`, par da `vars.VITE_HCAPTCHA_SITE_KEY`.
Atenção à ordem: com o captcha activo no Supabase Auth e **sem** a chave
pública definida nas `vars`, o SIGA publicado não mostra o widget e **todos os
logins por senha são recusados**. Ou se define o par completo, ou se desliga o
captcha no Supabase.

## 3. Alertas (dá para deixar para depois)

Sem estes, só não há aviso quando algo corre mal:

`SIGA_ALERT_WEBHOOK_URL` · `SIGA_GATEWAY_ALERT_SLACK_URL` ·
`SIGA_GATEWAY_FAILURE_RATE_ALERT_SLACK_URL` ·
`SIGA_GATEWAY_FAILURE_RATE_ALERT_EMAIL_FROM` ·
`SIGA_GATEWAY_FAILURE_RATE_ALERT_EMAIL_TO` ·
`SLACK_E2E_WEBHOOK_URL` · `E2E_ALERT_EMAIL_FROM` · `E2E_ALERT_EMAIL_TO`

Os jobs E2E (`ci.yml`, `ecosystem-e2e-live.yml`) querem além disso
`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_SECRET_KEY` — é o que os
põe a `skipping` hoje.

## 4. Configuração que não é segredo (`vars`)

Também estão todas por definir. Vazias não são enviadas, e o que já estiver no
painel da Cloudflare mantém-se:

`PLATFORM_DOMAIN` · `CLOUDFLARE_ZONE_ID` · `VITE_HCAPTCHA_SITE_KEY` ·
`APPYPAY_ENV` · `APPYPAY_CLIENT_ID` · `APPYPAY_RESOURCE` ·
`APPYPAY_GPO_METHOD` · `APPYPAY_REF_METHOD` · `GOOGLE_WORKSPACE_DOMAIN` ·
`MAILBOX_PROVIDER` · `PAYFLOW_AUTO_SYNC` · `PAYFLOW_R2_BUCKET` · `SMS_API_URL` ·
`WHATSAPP_OTP_TEMPLATE_NAME` · `WHATSAPP_PHONE_NUMBER_ID` ·
`ZOHO_MAIL_CLIENT_ID` · `ZOHO_MAIL_ORG_ID` · `ZOOM_CLIENT_ID` ·
`ZOOM_REDIRECT_URI`

## Caminho mais curto para publicar

1. Rodar a `service_role` no Supabase.
2. Criar os três do ponto 1 no ambiente `production`.
3. Correr o `deploy-production.yml` à mão (*Run workflow*) e confirmar **na
   Cloudflare** qual o commit que ficou em cada uma das quatro apps — o código
   de saída do `deploy:all` engana, já falhou a meio sem o dizer.
4. Depois disso, acrescentar os do ponto 2 conforme as funcionalidades forem
   sendo precisas.
