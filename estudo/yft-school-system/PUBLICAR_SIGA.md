# Publicar o YFT em m.portal-siga.com

Pedido do utilizador em 14/10/2026, com autorização do autor do YFT declarada
pelo utilizador. Guardar essa autorização escrita junto da documentação da
empresa: o `LICENSE` do repositório continua a ser BSL 1.1.

## O que muda (ler antes do passo 4)

- Hoje, `m.portal-siga.com` serve o **Mobile V4** do SIGA, através do Worker
  `siga-plus-mobile-v4-domain`, que liga ao Supabase das escolas.
- O YFT é **outro sistema**: Firebase Auth (`siga-plus-integracoes`), base D1
  própria (`siga-yft-db`), ficheiros no R2 (`siga-yft-media`). Começa vazio.
  Não lê contas, alunos, notas nem propinas do SIGA.
- Ao trocar o domínio, quem abrir `m.portal-siga.com` deixa de ver o Mobile V4
  e passa a ver o login do YFT. As contas SIGA não entram até serem criadas
  no Firebase e no D1.

## Atalho: publicar pelo GitHub (sem flutterfire), ainda por autorizar

O workflow `.github/workflows/yft-publicar.yml` foi escrito, mas não está no
repositório: o commit de um workflow de publicação em produção espera
autorização explícita. Sem ele, usar os passos 1 a 4 na máquina local. Com
ele, a configuração seria esta:

Settings → Environments → `production`. Os segredos `CLOUDFLARE_API_TOKEN` e
`CLOUDFLARE_ACCOUNT_ID` já lá estão. Acrescentar:

- Secrets: `FIREBASE_WEB_API_KEY`, `YFT_SUPER_ADMIN_API_KEY` (≥ 32 caracteres;
  `openssl rand -hex 32`), e opcionalmente `YFT_FIREBASE_SERVICE_ACCOUNT_JSON`.
- Variables: `FIREBASE_WEB_APP_ID` e `FIREBASE_MESSAGING_SENDER_ID`, da
  consola Firebase → Project settings → a app web.

Depois: Actions → «YFT — publicar (siga-yft)» → Run workflow → `teste`.
Quando o teste estiver validado, fazer o passo 4.1 e correr com `dominio`.
O token tem de ter permissão de edição em Workers, D1, R2 e Custom Domains.

Mesmo pelo GitHub, as definições da consola Firebase do passo 1 (login por
e-mail/senha e domínios autorizados) continuam a ser precisas.

## 1. Firebase (na tua máquina)

```sh
cd estudo/yft-school-system
dart pub global activate flutterfire_cli
firebase login
flutterfire configure --project=siga-plus-integracoes
```

Escolher as plataformas web e android. O comando reescreve
`lib/firebase_options.dart`, que já é usado por `lib/main.dart`:

```dart
await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
```

Esse ficheiro só tem valores públicos e pode ir para o Git. O
`google-services.json` do Android continua fora do Git (`.gitignore`).

Na consola Firebase (`siga-plus-integracoes`):

- Authentication → Sign-in method: activar **E-mail/Senha**.
- Authentication → Settings → **Authorized domains**: acrescentar
  `m.portal-siga.com` e o endereço `siga-yft.<conta>.workers.dev` do teste.
- Project settings → General: copiar a **Web API Key**, para usar como
  `FIREBASE_WEB_API_KEY`.

## 2. Teste em workers.dev (não toca no domínio)

Precisa do Flutter 3.41.x (o autor usou 3.41.5; com 3.47 não compila) e de
Node 22.

```sh
export CLOUDFLARE_API_TOKEN=...   # Workers Scripts/Routes, D1, R2, Custom Domains: Edit
export CLOUDFLARE_ACCOUNT_ID=701800d01d428c5141fa1fdb60ee01ae
export FIREBASE_WEB_API_KEY=...   # do passo 1
export SUPER_ADMIN_API_KEY="$(openssl rand -hex 32)"   # guardar num cofre
scripts/publicar-siga.sh teste
```

O script faz isto:

1. Confirma que `firebase_options.dart` é do projecto certo.
2. Compila a app com `API_BASE_URL` igual à própria origem.
3. Cria a base D1 e o bucket R2, se ainda não existirem, e aplica as 11
   migrações.
4. Publica o Worker `siga-yft`, que serve a app e a API, e grava os segredos.
5. Verifica `/health`, a página inicial e se `/api` sem sessão responde 401.

## 3. Primeiro administrador

O super-admin (`super-admin/`, Next.js) cria escolas e administradores. O
primeiro super-admin cria-se com a conta de serviço do Firebase:

```sh
cd school-worker
node scripts/create-super-admin.mjs   # pede a conta de serviço; ver o README do autor
```

Configurar `super-admin/.env.local` com `WORKER_API_URL` igual à origem do
passo 2 e com a mesma `SUPER_ADMIN_API_KEY`. Depois, entrar na app com um
administrador de escola e validar os percursos: login, admissão, turmas,
propinas, notas e recibo PDF.

## 4. Trocar o domínio m.portal-siga.com

Só depois de o passo 2 estar validado:

1. Cloudflare → Workers → `siga-plus-mobile-v4-domain` → Settings → Domains &
   Routes: remover o Custom Domain `m.portal-siga.com` e a rota
   `m.portal-siga.com/*`. **Não mexer na rota wildcard do portal.**
2. Logo a seguir (o domínio fica sem app entre estes dois passos):
   ```sh
   scripts/publicar-siga.sh dominio
   ```
   Isto liga `m.portal-siga.com` (Custom Domain e rota específica) ao Worker
   `siga-yft` e repete as verificações em `https://m.portal-siga.com`.

## Reversão (voltar ao Mobile V4)

1. Workers → `siga-yft` → Domains & Routes: remover `m.portal-siga.com` e
   `m.portal-siga.com/*`.
2. Voltar a publicar o Worker do domínio do SIGA, que repõe o Custom Domain e
   a rota:
   ```sh
   cd mobile-flutter/deployment
   npx wrangler@4.42.0 deploy --config wrangler.jsonc
   ```
   O `PAGES_ORIGIN` desse ficheiro aponta para o preview fixo do Mobile V4.
   Confirmar que é o que estava em produção antes da troca.
3. Abrir `https://m.portal-siga.com` e confirmar o login do Mobile V4.

Os dados do YFT (D1, R2, Firebase) ficam intactos; apenas deixam de estar no
domínio.
