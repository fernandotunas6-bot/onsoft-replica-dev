---
name: siga-desktop
description: >-
  PROMPT MASTER da aplicação Desktop Tauri do SIGA Plus: janelas, atalhos,
  offline-first, ficheiros, impressão, notificações, sincronização, ApiClient,
  segurança e actualizações. Usar ao editar src-tauri/, TauriTitlebar,
  DesktopTitleBar ou qualquer funcionalidade nativa desktop.
---

# SIGA Desktop (Tauri)

## Âmbito
- Tauri pertence **só ao SIGA escolar** (raiz). Nunca a ADMIN, WEB, DOC ou PAYFLOW.
- Mesmo frontend web; o desktop acrescenta capacidades nativas, não substitui ecrãs.
- Não alterar `src/components/layout/DesktopTitleBar.tsx` sem necessidade (corrige hidratação #418).

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
