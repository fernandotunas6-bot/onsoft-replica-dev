# Publicar versões da app desktop (SIGA Desktop)

A app desktop abre o SIGA publicado (`portal-siga.com`). Uma versão nova da app só é
precisa quando muda o lado nativo (`src-tauri/`, `desktop/`: impressão, gravação de
ficheiros, catraca, janelas…). As mudanças nos ecrãs chegam sozinhas, com o site.

Workflow: [`.github/workflows/release-desktop.yml`](../../.github/workflows/release-desktop.yml)
(Windows, macOS universal e Linux — .deb, .rpm, AppImage —, num **rascunho** de release).

## 1. Uma vez: chave de assinatura das actualizações

Sem chave, as versões saem na mesma, mas **sem actualizações automáticas** (cada
escola teria de reinstalar à mão).

1. Num computador de confiança, com o projecto instalado:

   ```sh
   npm run tauri -- signer generate -w ~/.tauri/siga-desktop.key
   ```

   Escolha uma palavra-passe. Ficam dois ficheiros: `siga-desktop.key` (privada) e
   `siga-desktop.key.pub` (pública).

2. No GitHub, **Settings → Secrets and variables → Actions**:
   - **Secrets** → `TAURI_SIGNING_PRIVATE_KEY` = conteúdo de `siga-desktop.key`
   - **Secrets** → `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` = a palavra-passe
   - **Variables** → `TAURI_UPDATER_PUBKEY` = conteúdo de `siga-desktop.key.pub`

3. Guarde a chave privada e a palavra-passe fora do computador (cofre de senhas).
   **Se se perderem, as apps instaladas deixam de aceitar actualizações** e cada escola
   tem de reinstalar.

A primeira versão publicada com a chave é a que passa a receber actualizações; as
instaladas antes disso têm de ser substituídas uma vez à mão.

## 2. Cada versão

1. Subir a versão nos quatro sítios, com o mesmo número (o workflow recusa se não
   coincidirem): `src-tauri/tauri.conf.json` (`version`), `src-tauri/Cargo.toml`
   (`version`) `desktop/package.json` (com `npm install --package-lock-only` em desktop) e o `Cargo.lock` (`cd src-tauri && cargo update -p siga-desktop`).
2. Juntar isso ao `main` e criar a tag:

   ```sh
   git tag v1.1.0
   git push origin v1.1.0
   ```

O workflow constrói os instaladores num **rascunho** de release. Nada chega às escolas até:

1. Abrir **Releases**, rever o rascunho `SIGA Desktop v1.1.0` e escrever as novidades.
2. Publicar: **Actions → Publicar versão do SIGA Desktop → Run workflow**, com a tag
   (`v1.1.0`). O workflow confirma que os 5 instaladores com nome fixo estão no rascunho
   antes de o publicar. (Carregar em **Publish release** na página da release também
   serve, mas sem essa verificação.)

## Transferência no site

O site (`painel/web`, página `/download`, menu «Transferir», rodapé e secção na página
inicial) liga a `https://github.com/<repo>/releases/latest/download/<nome fixo>`. Cada
build envia, além dos ficheiros com a versão no nome, estas cópias
(`scripts/desktop/stable-assets.mjs`):

| Sistema                       | Ficheiro                                                                                              |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| Windows                       | `SIGA-Desktop-Windows-x64-setup.exe`                                                                  |
| macOS (Intel e Apple Silicon) | `SIGA-Desktop-macOS-universal.dmg`                                                                    |
| Linux                         | `SIGA-Desktop-Linux-x86_64.AppImage`, `SIGA-Desktop-Linux-amd64.deb`, `SIGA-Desktop-Linux-x86_64.rpm` |

Os links servem sempre a última versão **publicada** (os rascunhos não contam), por isso
o site não muda a cada versão. A página mostra a versão e os tamanhos lidos da API
pública do GitHub; sem resposta, os links continuam a funcionar. Outro repositório:
`VITE_DESKTOP_RELEASES_REPO=dono/repo` no build do site.

A partir daí, as apps instaladas (com chave configurada) mostram, 15 s depois de abrir,
«Nova versão do SIGA — Instalar e reiniciar». Nunca instalam sozinhas, nem com
gravações por enviar.

## Assinatura do sistema operativo (opcional, recomendada)

Sem ela a app funciona, mas o sistema avisa na primeira abertura:

- **Windows** (SmartScreen: «O Windows protegeu o seu PC» → _Mais informações_ →
  _Executar mesmo assim_): certificado de assinatura de código.
- **macOS** (Gatekeeper: «não é possível verificar o programador» → clique direito →
  _Abrir_): conta Apple Developer e os segredos `APPLE_CERTIFICATE`,
  `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`,
  `APPLE_TEAM_ID` (o `tauri-action` usa-os quando existem; acrescentá-los ao `env` do
  passo «Build Tauri app» no workflow).

## Verificar localmente (Linux)

```sh
npm run tauri -- signer generate -w /tmp/teste.key --ci -p ""
UPDATER_PUBKEY="$(cat /tmp/teste.key.pub)" HAS_PRIVATE_KEY=true \
  REPO=dono/repo node scripts/desktop/release-config.mjs
TAURI_SIGNING_PRIVATE_KEY="$(cat /tmp/teste.key)" TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" \
  npm run tauri -- build --bundles deb --config src-tauri/tauri.release.conf.json -- --locked
```

O `.deb` sai com o `.sig` ao lado. Apague `src-tauri/tauri.release.conf.json` no fim
(está no `.gitignore`).
