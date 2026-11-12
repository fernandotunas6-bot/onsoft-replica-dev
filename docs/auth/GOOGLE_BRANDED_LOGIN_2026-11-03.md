# Login Google com marca SIGA Plus — implementação controlada (03/11/2026)

## Motivo
O ecrã de escolha de conta do Google mostra `xodgfmxiaunpamctfeea.supabase.co`
quando a autenticação parte de `supabase.auth.signInWithOAuth({ provider: 'google' })`.
O logótipo e o nome no Google Cloud Branding **não substituem** esse domínio
técnico no ecrã de escolha de conta.

## Solução entregue neste ramo
- `src/components/auth/GoogleIdentityButton.tsx`: o botão oficial Google
  Identity Services (GIS) recebe um ID token e entrega-o a
  `supabase.auth.signInWithIdToken({ provider: 'google', token, nonce })`.
- Nonce WebCrypto com 32 bytes aleatórios; Google recebe hash SHA-256 do nonce;
  Supabase recebe o valor original.
- A sessão continua a ser emitida pelo Supabase e observada pelo `AuthGate`.
  `RouteAccessGate`, memberships escolares, políticas RLS e MFA opcional ficam intactos.
- Só é activado quando `VITE_GOOGLE_CLIENT_ID` está presente e o hostname actual
  pertence a `VITE_GOOGLE_ALLOWED_ORIGINS`.
- Sem configuração ou sem GIS disponível, o botão OAuth antigo mantém-se.
- A rota `/.lovable/oauth/consent` mantém a redirecção anterior, para preservar
  o protocolo de autorização externo.
- Não são necessárias migrações SQL, chaves de servidor adicionais ou planos pagos.

## Pré-requisito externo (não concluído automaticamente)
O **dono do Google Cloud** deve abrir:
1. [Google Auth Platform — Branding](https://console.cloud.google.com/auth/branding):
   nome SIGA Plus; adicionar logótipo oficial, homepage, domínio verificado,
   política de privacidade e termos (quando exigidos); publicar/verificar a
   configuração conforme o tipo de audiência.
2. [Google Auth Platform — Clients](https://console.cloud.google.com/auth/clients):
   no *mesmo projecto Google* usado no Supabase Auth, identificar o **Client ID**
   OAuth do tipo **Web application**. Configurar **Authorized JavaScript origins**
   como `https://portal-siga.com` e outras origens HTTPS exactas que vão usar GIS.
   Subdomínios não são cobertos por wildcard; não inserir `*.portal-siga.com`.
3. [Supabase — Auth Providers](https://supabase.com/dashboard/project/xodgfmxiaunpamctfeea/auth/providers?provider=Google):
   confirmar que Google está activo e que o **mesmo Web Client ID** consta dos IDs
   permitidos. Não é necessário alterar o segredo OAuth se já funciona.
4. [GitHub — Environment variables](https://github.com/fernandotunas6-bot/onsoft-replica-dev/settings/environments):
   a pipeline de produção usa por omissão o **Web Client ID público** já fornecido
   pelo proprietário em Setembro de 2026. O valor pode ser substituído em
   `VITE_GOOGLE_CLIENT_ID` se o cliente for rodado ou revogado.
   `VITE_GOOGLE_ALLOWED_ORIGINS` aceita uma lista CSV de origens exactas;
   por omissão, apenas `https://portal-siga.com` usa GIS.
   `VITE_GOOGLE_IDENTITY_ENABLED=false` força o regresso ao OAuth clássico no
   próximo build; a configuração por omissão é `true`.
   **Nunca** colocar `Client secret` nem `service_role` em variáveis VITE.
5. A configuração é aplicada **durante o build** pelo GitHub Actions, não
   apenas nas bindings do Worker na Cloudflare. Antes de considerar a activação
   validada, confirmar no Google Cloud que o OAuth Web Client ID está autorizado
   para `https://portal-siga.com` e testar o login real no browser.

## Aceitação e publicação
- Abrir `https://portal-siga.com` sem sessão em Android e desktop; confirmar
  botão GIS, com escolha de conta associada ao SIGA Plus e sem project-ref Supabase.
- Entrar com conta já autorizada; sessão restaurada, identidade correcta e escola
  seleccionada, sem alteração de vinculação.
- Entrar com conta Google nova; sem memberships, não pode ver dados escolares.
- Verificar login por e-mail/senha, BI, recuperações, MFA voluntária e sessão
  partilhada; testar logout e volta ao login.
- Testar em origem não listada (escola/subdomínio/custom domain): OAuth anterior
  continua a funcionar. Testar `/.lovable/oauth/consent` e app desktop separadamente.
- Testes de CI: `bun run typecheck`, `bun run lint`,
  `bun run test -- tests/auth/google-identity.test.tsx` e `bun run test`.
- Não declarar login GIS em produção até confirmar **Client ID configurado**,
  as origens aceites no Google Cloud e teste real com uma conta.

## Reversão
Definir `VITE_GOOGLE_IDENTITY_ENABLED=false` em `production` e fazer novo build/deploy.
O botão antigo e todas as sessões Supabase permanecem disponíveis. Nunca
desactivar o Google provider no Supabase para esta reversão.

## Alternativa de infraestrutura
Se for obrigatório manter o fluxo Google OAuth redireccionado, configurar
`auth.portal-siga.com` como domínio personalizado do Supabase (plano + add-on
pagos). Isto é um percurso **alternativo**, não requisito do GIS. Preparar primeiro
os URI de callback no Google Cloud e só depois activar o domínio do Supabase.
