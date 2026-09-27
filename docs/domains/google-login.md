# Entrar com Google

O botão "Entrar com Google" (`AuthGate.tsx`, `signInWithOAuth`) passa pelo
Supabase Auth do projecto **Sga** (`xodgfmxiaunpamctfeea`). São precisas duas
configurações, feitas nos painéis e não no código.

## Estado em 2026-09-28

A única tentativa registada (2026-09-26, a partir de `admi.portal-siga.com`)
falhou no regresso do Google com:

```
500: Unable to exchange external code
oauth2: "invalid_client" "The provided client secret is invalid."
```

O **Client secret** guardado no Supabase não corresponde ao cliente OAuth da
Google. O Client ID está certo, porque a Google aceitou o pedido e devolveu um
código. O que falha é só a troca do código pelo token, que usa o segredo.

## 1. Google Cloud Console

APIs e serviços → Credenciais → o cliente OAuth 2.0 do SIGA (tipo *Aplicação
Web*):

- **URIs de redireccionamento autorizados**: exactamente
  `https://xodgfmxiaunpamctfeea.supabase.co/auth/v1/callback`
- **Client secret**: copiar o actual ou criar um novo ("Adicionar segredo").
  Um segredo novo só aparece por inteiro no momento em que é criado.
- Ecrã de consentimento OAuth: se estiver em modo *Teste*, só entram as contas
  listadas em "Utilizadores de teste". Para toda a gente, publicar a aplicação.

## 2. Supabase

**Authentication → Sign In / Providers → Google**:

- **Client ID**: o mesmo da Google Cloud Console.
- **Client Secret**: colar o segredo do passo 1, sem espaços no início nem no
  fim, e guardar.

**Authentication → URL Configuration**:

- **Site URL**: `https://portal-siga.com`
- **Redirect URLs**: a aplicação pede o regresso ao próprio domínio
  (`window.location.origin`), e cada escola tem o seu subdomínio. Sem estas
  entradas, o Supabase ignora o pedido e manda a pessoa para o Site URL:
  - `https://portal-siga.com/**`
  - `https://*.portal-siga.com/**`
  - `http://localhost:3000/**` (desenvolvimento, se for usado)

## 3. Verificar

1. Numa janela privada, abrir `https://portal-siga.com` e escolher "Entrar com
   Google".
2. Depois de escolher a conta, a pessoa volta à aplicação com sessão iniciada.
   Uma conta sem vínculo a uma escola vê o painel de integração institucional,
   o que está correcto.
3. Se falhar, a aplicação mostra "Não foi possível entrar com a conta externa…"
   (`src/lib/auth-redirect-error.ts`). A causa exacta fica nos registos do Auth
   (Supabase → Logs → Auth, filtrar por `/callback`).
