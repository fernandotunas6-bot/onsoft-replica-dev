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

### Estado: configurada a 26/10/2026

| O quê                                      | Onde                                                                                                                               |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Chave privada                              | Segredo `TAURI_SIGNING_PRIVATE_KEY`, **ao nível do repositório** (não num ambiente: o `release-desktop.yml` não usa ambientes)     |
| Palavra-passe                              | Segredo `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, no mesmo sítio. É aleatória, gerada com a chave                                      |
| Chave pública                              | Variável `TAURI_UPDATER_PUBKEY`, no mesmo sítio                                                                                    |
| Identificador da chave                     | `8978E84141130A74` (minisign)                                                                                                      |
| Cópias da chave privada e da palavra-passe | `~/.tauri/siga-desktop.key`, `~/.tauri/siga-desktop.password` (com `chmod 600`) no computador do dono, e o cofre de senhas do dono |

A chave privada e a palavra-passe **nunca entram neste repositório** nem em conversas: com
as duas, alguém podia assinar uma actualização que as apps das escolas aceitam. O GitHub
não as deixa ler depois de gravadas, por isso a cópia no cofre é a única recuperável.

Confirmar que a chave pública gravada é a do ficheiro (a variável pode ler-se):

```sh
[ "$(gh variable get TAURI_UPDATER_PUBKEY | tr -d '\n ')" = "$(tr -d '\n ' < ~/.tauri/siga-desktop.key.pub)" ] && echo igual
```

**Se a chave se perder:** as apps instaladas não aceitam actualizações assinadas por outra.
Gerar uma chave nova (passo 1), gravar os três valores e publicar uma versão; cada escola
reinstala essa versão uma vez à mão.

**Se a chave for exposta:** fazer o mesmo de imediato. Para chegar às escolas, uma
actualização falsa precisa também de entrar numa release publicada deste repositório, mas
não se deve contar com essa segunda barreira.

## Histórico de versões

| Versão                          | Estado                                                                                                | Actualizações automáticas                                                                 |
| ------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| v1.1.0 – v1.2.2 (06–10/10/2026) | Publicadas                                                                                            | Não (sem chave): substituir à mão                                                         |
| v1.3.0 (25/10/2026)             | Rascunho, **nunca publicada**                                                                         | Não. Ficou para trás de propósito: publicá-la obrigava as escolas a reinstalar duas vezes |
| v1.3.1 (26/10/2026)             | **Publicada** a 26/10, 15:30 UTC; Tauri 2.12.5; as 10 entradas do `latest.json` assinadas com a chave | **Sim**: a primeira. As seguintes chegam pelo botão «Instalar e reiniciar»                |

Na construção da v1.3.1 (run 40343925848), o macOS ficou na fila até o GitHub o
cancelar por falta de máquinas («not acquired by Runner… even after multiple
attempts»). Repetir só esse job (`gh run rerun <id> --failed`) junta os ficheiros ao
mesmo rascunho, sem refazer o Windows nem o Linux.

## 2. Cada versão

1. Subir a versão nos quatro sítios, com o mesmo número (o workflow recusa se não
   coincidirem): `src-tauri/tauri.conf.json` (`version`), `src-tauri/Cargo.toml`
   (`version`) `desktop/package.json` (com `npm install --package-lock-only` em desktop) e o `Cargo.lock` (`cd src-tauri && cargo update -p siga-desktop`).
2. Juntar isso ao `main` e criar a tag:

   ```sh
   git tag v1.1.0
   git push origin v1.1.0
   ```

   Sem acesso a enviar tags: **Actions → Release Desktop App (Tauri) → Run workflow**, no
   `main`, com a versão (`1.1.0`). O workflow confirma que é a versão da app, cria a tag
   `v1.1.0` no commit do `main` e compila.

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

O workflow de publicação junta ainda `SHA256SUMS.txt` (somas SHA-256 dos cinco ficheiros), que a página oferece em «Verificar integridade».

Os links servem sempre a última versão **publicada** (os rascunhos não contam), por isso
o site não muda a cada versão. A página mostra a versão e os tamanhos lidos da API
pública do GitHub; sem resposta, os links continuam a funcionar. Outro repositório:
`VITE_DESKTOP_RELEASES_REPO=dono/repo` no build do site.

A partir daí, as apps instaladas (com chave configurada) mostram, 15 s depois de abrir,
«Nova versão do SIGA — Instalar e reiniciar». Nunca instalam sozinhas, nem com
gravações por enviar.

## Assinatura do sistema operativo (opcional, recomendada)

**Estado (26/10/2026): por fazer.** As actualizações já são assinadas (chave
`8978E84141130A74`, acima), mas os instaladores ainda não têm certificado de editor,
por isso o SmartScreen e o Gatekeeper pedem confirmação na primeira instalação. Exige
comprar um certificado de assinatura de código (Windows) e uma conta Apple Developer
(macOS): é decisão e conta do dono. A app Android tem a sua própria assinatura:
[estudo/yft-school-system/docs/PUBLICAR_ANDROID.md](../../estudo/yft-school-system/docs/PUBLICAR_ANDROID.md).

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
