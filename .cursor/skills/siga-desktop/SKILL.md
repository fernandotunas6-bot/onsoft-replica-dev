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

## Estado verificado (2026-10-25)

Ler `docs/desktop/TAURI_RUNTIME.md`, `docs/desktop/OFFLINE_FIRST_ROADMAP.md` e `desktop/AGENTS.md`.

- Base completa Danny Smith Tauri Template; frontend local em `desktop/`, Rust único em `src-tauri/`.
- `main` e `quick-pane` locais usam as capacidades do template. A janela `offline-shell` tem bundle próprio e capability mínima (`src-tauri/capabilities/offline-shell.json`): apenas demonstra a UI instalada, sem dados escolares nem permissão para serviços nativos privilegiados. Portal SSR em `school`, apenas `https://portal-siga.com/*`, com permissões escolares mínimas.
- Comandos tipados em `bindings.rs` e manifesto `build.rs`; compatibilidade web em `school/mod.rs`. Capabilities correspondentes e testes verificam o contrato.
- Nunca conceder ao portal plugins livres de fs, updater, process, shell, store, dialog ou stronghold.
- Store e Stronghold no portal: só pelos comandos de caminho fixo `portal_store_*` / `portal_vault_*` (`src-tauri/src/school/native_storage.rs`); a app local recebe os plugins completos.
- Updater só com chave pública real; a central não instala actualizações. Instalação no portal respeita gravações pendentes.
- Impressão, hardware, exportações e PayFlow preservados. Launcher e `tauri.dev.conf.json` removidos.
- npm com lockfile em `desktop/`; Bun mantém-se para o SIGA web. `npm run desktop:quality` para os checks do template.
- Release por tag igual à versão, draft, assinatura só com chaves. Sem tags de teste nem publicação automática.
- A central Tauri (v1.2.2) instala-se localmente, mas a janela escolar é REMOTA e parte dos módulos académicos continua online. Não anunciar offline completo antes da base local e dos testes documentados no roadmap.
- Stronghold guarda a sessão e uma fila limitada de notas/chamadas; não apagar o cofre nem reinstalar sem avaliar alterações por enviar. Windows inclui WebView2 offline, mas isso não instala o backend.
- Testes físicos Windows/macOS/Linux e revisão de segurança por escola/actor continuam obrigatórios.

## Janelas e produtividade

- Janela principal + janelas secundárias (pauta, recibo, impressão) com estado lembrado (tamanho/posição).
- Atalhos globais e locais consistentes (Ctrl/Cmd+K pesquisa, Ctrl+N novo, Ctrl+P imprimir, Ctrl+S guardar).
- Menus nativos e barra de título própria; respeitar tema claro/escuro do sistema.

## Offline-first

- Fluxo: UI → cache local → API remota. Invalidar cache correctamente após escrita.
- Fila de alterações local; sincronizar por prioridade: 1) alterações do utilizador, 2) dados do ecrã activo, 3) restante em segundo plano.
- Não usar carimbo temporal isolado como resolução automática de conflitos: manter versões de registo, idempotência e revisão humana em notas, pagamentos e dados críticos. Nunca perder escrita silenciosamente.
- Escritas locais simultâneas devem ser persistidas sequencialmente; corrupção da fila cifrada bloqueia escrita e exige recuperação, não substituição por fila vazia.
- Nenhuma fila offline nova sem `school_id`, `actor_id`, `op_id` e validação RLS/MFA no servidor, com migração segura da fila legada.
- A fila actual agora regista escola e actor, e verifica os dois ao enviar; registos anteriores sem escola nunca são enviados automaticamente. Idempotência `op_id` e SQLite total permanecem pendentes.
- Em perda de resposta após HTTP, o servidor pode ter gravado: o cofre persiste `sending` **antes** de qualquer envio nativo, mesmo com rede, e bloqueia o replay no estado `needs_verification` após crash/timeout. Nunca eliminar ou reenviar esta entrada sem verificar o estado no servidor, nem permitir `discardOutboxItem` neste estado. Se o cofre falhar, **não** iniciar o HTTP. Recibos idempotentes transaccionais no backend são pré-requisito para retoma automática.
- **Política da cache não cifrada (v2):** guardar somente o DTO mínimo dos anos e períodos lectivos; **nunca** serializar `school.settings`, dados bancários/AGT, calendários, listas de alunos, salas ou snapshots completos do TanStack Query em `localStorage`.
- A origem `school_id` dos anos/períodos é fornecida pelo servidor com membership autenticado e tem de corresponder à escola activa antes de persistir. As cópias antigas `siga:offline-queries:v1:` devem ser apagadas; nunca reidratá-las. Usar `tests/tauri/offline-queries.test.ts` como teste de regressão.
- Metadados do calendário académico em cache **não** são SQLite offline autenticado. Dados privados exigem cofre/cifragem, isolamento por utilizador e dispositivo, política de expiração e revogação.
- O esquema de futura base local é `desktop/local-db/0001_offline_metadata.sql`; o teste SQLite real em memória corre no CI. **Não está activo no runtime**: antes de abrir no posto exigir SQLCipher comprovado, chave no cofre, esquema versionado e autorização do servidor. Nunca usar SQLite sem cifragem para dados escolares.

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

- Updater assinado, canal estável; verificar no arranque, ao regressar a internet e periodicamente. Pedir confirmação antes de instalar.
- Nunca actualizar com escrita React pendente **ou fila cifrada por enviar/recusada**; preservar dados e compatibilidade das futuras migrações SQLite.
- Release por tag e rascunho, com chaves reais no CI; nunca adicionar chave privada ao repositório.
