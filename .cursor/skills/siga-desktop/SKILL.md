---
name: siga-desktop
description: >-
  PROMPT MASTER da aplicação Desktop Tauri do SIGA Plus: janelas, atalhos,
  offline-first, ficheiros, impressão, notificações, sincronização, ApiClient,
  segurança e actualizações. Usar ao editar src-tauri/, desktop/,
  DesktopIntegration ou qualquer funcionalidade nativa desktop.
---

# SIGA Desktop (Tauri)

## Âmbito
- Tauri pertence **só ao SIGA escolar** (raiz). Nunca a ADMIN, WEB, DOC ou PAYFLOW.
- Mesmo frontend web; o desktop acrescenta capacidades nativas, não substitui ecrãs.

## Estado actual (2026-10-03, PR #63)
Ler primeiro `docs/desktop/TAURI_RUNTIME.md` (comandos, permissões, hardware, release).
- **Launcher local** (`desktop/`, `frontendDist`): ecrã «Abrir SIGA» que abre
  `https://portal-siga.com`. O SIGA é SSR num Worker: `.output/public` não tem interface.
- **Permissões mínimas:** capability `default` (launcher) e `school-portal` (origem exacta
  do portal). Nada de `shell:`, `fs:`, `store:`, `dialog:`, `updater:`, `process:`,
  `stronghold:` nem `opener:` para o portal: o que a app faz com eles passa por comandos
  próprios. **Comando novo = três sítios** (`generate_handler!`, manifesto em `build.rs`,
  `allow-<comando>` na capability e em `tauri.dev.conf.json`); `tests/tauri/capabilities.test.ts`
  confere.
- **Arranque:** o updater só é registado com `plugins.updater` (sem isso a app terminava
  ao abrir). `check-desktop.mjs` e um teste guardam isto.
- **Janela:** barra de título nativa; a web já não desenha barras próprias na app.
  Fechar a janela principal sai da app; bandeja Abrir/Sair; instância única.
- **Comandos:** hardware endurecido (IPs privados, sem simulação, daemon por IPC),
  `save_file` (exportações), `print_page`/`print_html` (macOS; `print_html` em janela
  `sigapage://` sem scripts), `open_payflow` (SSO numa janela própria, só para o PayFlow
  oficial), `open_external_url`, `check_app_update`/`install_app_update`.
- **Notificações do sistema** (`DesktopNotifications` no AppShell): mensagem nova (só o
  remetente), comunicado publicado (regra da lista) e «Alterações enviadas», só com a app
  em segundo plano; regras em `src/lib/desktop-notifications.ts`.
- **Frontend:** `DesktopIntegration` (exportações, links fora do portal no browser do
  sistema, impressão no macOS, atalhos e zoom, aviso de versão nova). Sem rede — fase 1
  no `OfflineBanner` (`src/lib/pending-writes.ts`).
- **Release:** `release-desktop.yml` (tag `v<versão>` igual à do tauri.conf.json e do
  Cargo.toml), rascunho; actualizações assinadas só com as chaves
  (`docs/desktop/PUBLICAR_VERSOES.md`).
- **Verificar na app real (Linux):** `cargo build` com `TAURI_CONFIG="$(cat tauri.dev.conf.json)"`
  e uma página em `localhost:3006` que chame `window.__TAURI_INTERNALS__.invoke(...)`;
  `xvfb-run` (ou Xvfb + openbox para ver a barra nativa). `cargo build --features
  tauri/custom-protocol` mostra o launcher embutido.
- **Por fazer / decidir:** modo totalmente offline (interface embutida, base local
  cifrada, sincronização) — análise feita, decisão do dono; sessão no cofre do sistema;
  testes reais em Windows/macOS; assinatura de código Windows/Apple.

## Janelas e produtividade
- Janela principal + janelas secundárias (pauta, recibo, impressão) com estado lembrado (tamanho/posição).
- Atalhos globais e locais consistentes (Ctrl/Cmd+K pesquisa, Ctrl+N novo, Ctrl+P imprimir, Ctrl+S guardar).
- Menus nativos e barra de título própria; respeitar tema claro/escuro do sistema.

## Offline-first
- Fluxo: UI → cache local → API remota. Invalidar cache correctamente após escrita.
- Fila de alterações local; sincronizar por prioridade: 1) alterações do utilizador, 2) dados do ecrã activo, 3) restante em segundo plano.
- Resolver conflitos com carimbo temporal e aviso ao utilizador; nunca perder escrita silenciosamente.

## Sistema de ficheiros, impressão, notificações
- Diálogos nativos para abrir/guardar (CSV, XLSX, PDF); só pastas escolhidas pelo utilizador.
- Impressão directa de pautas, recibos e declarações com pré-visualização.
- Notificações do sistema para pagamentos, comunicados e fim de sincronização.

## ApiClient
- Camada única com autenticação, retry com backoff, timeout, interceptors, refresh token, tratamento de erros em português e detecção offline.

## Segurança
- Capabilities mínimas em `src-tauri/capabilities/`; sem shell livre nem fs amplo.
- Nenhum secret no cliente; chaves só no servidor. CSP restritiva.
- Sessão guardada no cofre do sistema quando disponível.

## Actualizações
- Updater assinado, canal estável; nunca actualizar a meio de escrita pendente.
