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
- A central local usa o template completo; os ecrãs escolares continuam no frontend web e abrem na janela school.

## Estado actual (2026-10-05)

Ler `docs/desktop/TAURI_RUNTIME.md` e `desktop/AGENTS.md`.

- Base completa Danny Smith Tauri Template; frontend local em `desktop/`, Rust único em `src-tauri/`.
- `main` e `quick-pane` locais usam as capacidades do template. Portal SSR em `school`, apenas `https://portal-siga.com/*`, com permissões escolares mínimas.
- Comandos tipados em `bindings.rs` e manifesto `build.rs`; compatibilidade web em `school/mod.rs`. Capabilities correspondentes e testes verificam o contrato.
- Nunca conceder ao portal plugins livres de fs, updater, process, shell, store, dialog ou stronghold.
- Store e Stronghold no portal: só pelos comandos de caminho fixo `portal_store_*` / `portal_vault_*` (`src-tauri/src/school/native_storage.rs`); a app local recebe os plugins completos.
- Updater só com chave pública real; a central não instala actualizações. Instalação no portal respeita gravações pendentes.
- Impressão, hardware, exportações e PayFlow preservados. Launcher e `tauri.dev.conf.json` removidos.
- npm com lockfile em `desktop/`; Bun mantém-se para o SIGA web. `npm run desktop:quality` para os checks do template.
- Release por tag igual à versão, draft, assinatura só com chaves. Sem tags de teste nem publicação automática.
- Módulos académicos continuam online. Offline completo, cofre e validação física Windows/macOS são trabalho separado.

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
