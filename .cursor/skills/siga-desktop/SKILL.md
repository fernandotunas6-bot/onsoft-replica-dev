---
name: siga-desktop
description: >-
  PROMPT MASTER da aplicação Desktop Tauri do SIGA Plus: janelas, atalhos,
  offline-first, ficheiros, impressão, notificações, sincronização, ApiClient,
  segurança e actualizações. Usar ao editar src-tauri/, DesktopTitleBar,
  DesktopIntegration ou qualquer funcionalidade nativa desktop.
---

# SIGA Desktop (Tauri)

## Âmbito
- Tauri pertence **só ao SIGA escolar** (raiz). Nunca a ADMIN, WEB, DOC ou PAYFLOW.
- Mesmo frontend web; o desktop acrescenta capacidades nativas, não substitui ecrãs.
- Não alterar `src/components/layout/DesktopTitleBar.tsx` sem necessidade (corrige hidratação #418).

## Estado actual (2026-09-29)
- **A app abre o SIGA publicado.** O SIGA é SSR num Worker (server functions): não há
  build estático para embutir. `frontendDist` = `src-tauri/shell/` — página de arranque que
  confirma a rede e segue para `https://portal-siga.com/`; sem rede mostra "Sem ligação" e
  continua sozinha quando a rede volta. Em `tauri dev` abre `devUrl` (localhost:3006).
  Mudar o destino: `SIGA_DESKTOP_URL` no shell + `remote.urls` na capability.
- **Capability** `default`: local + remoto só `portal-siga.com` e `*.portal-siga.com`.
  Janela: arrastar, minimizar, maximizar, fechar, zoom. Tudo o resto nega-se.
- **Uma só barra de título** (`DesktopTitleBar`, na raiz). macOS: semáforos nativos
  (`titleBarStyle: Overlay`). Windows/Linux: sem decoração nativa
  (`tauri.windows.conf.json` / `tauri.linux.conf.json`) e botões próprios.
  `html[data-desktop]` liga `--titlebar-h` (36px), que o shell desconta.
- **Updater** só é registado quando `plugins.updater` (pubkey + endpoints) existir no
  `tauri.conf.json`. Registado sem configuração, a app rebentava ao abrir.
- **Bandeja**: fechar a janela esconde-a; menu "Abrir o SIGA" / "Sair do SIGA".
  **Instância única**: abrir de novo foca a janela existente.
- **Frontend** (`DesktopIntegration`): links para fora do SIGA abrem no browser do sistema
  (`plugin:opener|open_url`); F5/Ctrl+R, Alt+←/→, Ctrl + / − / 0 (zoom lembrado).
  Regras puras em `src/lib/desktop-shortcuts.ts` (testes em `tests/tauri/`).
- `ConnectionStatus` (desktop, PWA e web): aviso quando a rede cai.

## Verificar
- `cd src-tauri && cargo build` e correr `./target/debug/siga-desktop` (Linux: `xvfb-run`).
- Em falta: pipeline de releases assinadas (updater), offline-first com fila local,
  diálogos nativos de ficheiros, impressão directa, POST com `target=_blank` (PayFlow SSO).

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
