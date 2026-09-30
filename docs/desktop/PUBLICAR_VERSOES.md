# Publicar versões da app desktop (SIGA Desktop)

A app desktop abre o SIGA publicado (`portal-siga.com`). Uma versão nova da app só é
precisa quando muda o lado nativo (`src-tauri/`: impressão, gravação de ficheiros,
catraca, janelas…). As mudanças nos ecrãs chegam sozinhas, com o site.

Workflow: [`.github/workflows/desktop-release.yml`](../../.github/workflows/desktop-release.yml).

## 1. Uma vez: chave de assinatura das actualizações

Sem chave, as versões saem na mesma, mas **sem actualizações automáticas** (cada
escola teria de reinstalar à mão).

1. Num computador de confiança, com o projecto instalado:

   ```sh
   bun run tauri signer generate -w ~/.tauri/siga-desktop.key
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

## 2. Cada versão

```sh
git tag desktop-v1.0.1
git push origin desktop-v1.0.1
```

(ou **Actions → SIGA Desktop — publicar versão → Run workflow**, com a versão.)

O workflow constrói Windows (`.msi`, `-setup.exe`), macOS universal (`.dmg`) e Linux
(`.AppImage`, `.deb`, `.rpm`) num **rascunho** de release. Nada chega às escolas até:

1. Abrir **Releases**, rever o rascunho `SIGA Desktop 1.0.1` e escrever as novidades.
2. Carregar em **Publish release**.

A partir daí, as apps instaladas (com chave configurada) mostram, 15 s depois de abrir,
"Nova versão do SIGA — Instalar e reiniciar". Nunca instalam sozinhas.

## Assinatura do sistema operativo (opcional, recomendada)

Sem ela a app funciona, mas o sistema avisa na primeira abertura:

- **Windows** (SmartScreen: "O Windows protegeu o seu PC" → _Mais informações_ →
  _Executar mesmo assim_): certificado de assinatura de código.
- **macOS** (Gatekeeper: "não é possível verificar o programador" → clique direito →
  _Abrir_): conta Apple Developer e os segredos `APPLE_CERTIFICATE`,
  `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`,
  `APPLE_TEAM_ID` (o `tauri-action` usa-os quando existem; acrescentá-los ao `env` do
  passo "Construir" no workflow).

## Verificar localmente (Linux)

```sh
bun run tauri signer generate -w /tmp/teste.key --ci
VERSION=1.0.1 UPDATER_PUBKEY="$(cat /tmp/teste.key.pub)" HAS_PRIVATE_KEY=true \
  REPO=dono/repo node scripts/desktop/release-config.mjs
TAURI_SIGNING_PRIVATE_KEY="$(cat /tmp/teste.key)" TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" \
  bun run tauri build --bundles deb --config src-tauri/tauri.release.conf.json
```
