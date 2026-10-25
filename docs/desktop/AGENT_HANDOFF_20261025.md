# SIGA Plus Tauri Desktop — instruções ao outro agente (25-10-2026)

Este documento é a passagem de trabalho para Claude Code/Codex e agentes
paralelos em `fernandotunas6-bot/onsoft-replica-dev`. Antes de começar,
verifica SEMPRE `git fetch origin`, `git status`, o SHA do `main`, PRs
abertas e resultados CI. Esta fotografia pode ficar desactualizada.

## Missão e localização

Construir progressivamente o funcionamento offline real do SIGA Plus Desktop,
com actualizações assinadas e sincronização quando a Internet regressar.
**Preservar o sistema existente:** SIGA escolar TanStack Start em `src/`,
central instalada em `desktop/`, backend nativo em `src-tauri/`, Supabase,
Cloudflare e experiência SIGA multi-tenant. Não trabalhar nos projectos
`painel/admin`, `painel/web` nem Payflow para tarefas exclusivamente Desktop.
Não apagar funcionalidades, substituir o frontend, migrar SQL de produção
nem aplicar novos designs incompatíveis.

Ler obrigatoriamente:
`.cursor/skills/siga-desktop/SKILL.md`;
`desktop/AGENTS.md`;
`docs/desktop/TAURI_RUNTIME.md`;
`docs/desktop/OFFLINE_FIRST_ROADMAP.md`;
`docs/desktop/LOCAL_UI_DEPENDENCIES.md`;
`docs/desktop/LOCAL_SQLITE_FOUNDATION.md`;
`docs/desktop/OFFLINE_SYNC_CONTRACT.md`.
Issue principal: **#289**.

## Histórico integrado — não repetir tarefas feitas

- **#288** Stronghold/outbox e tenant, bloqueio de actualizador no frontend.
- **#293** verificação de actualizações no launcher com reconexão.
- **#297** bundle inicial `offline-shell` estático instalado; portal
  `school` continua remoto em `https://portal-siga.com`.
- **#300** cache v2 limitada a anos/períodos; dados fiscais, bancários e
  pessoais excluídos do `localStorage`.
- **#302** esquema SQLite local v1 versionado, **ainda não ligado** ao Rust,
  com testes reais em memória.
- **#303** contrato `op_id`, contexto triplo, revisões e conflitos;
  ainda não existe recibo transaccional de sync no backend.
- **#305** entregas incertas ficam `needs_verification` no Stronghold,
  bloqueando o replay automático.
- **#306** comando Rust de diagnóstico; SQLCipher e auth offline ainda
  indisponíveis, sem expor dados escolares.
- **#307** guarda nativa do actualizador: não instalar com outbox ou cofre
  inacessível.
- **#309** escrita antecipada (write-ahead) no Stronghold **antes de HTTP**
  para notas e presenças, mesmo online; integrada no `main`.
- **#316** reabrir portal escolar da janela local; PR ainda em validação
  nesta passagem: confirmar SHA, lint, Rust e CI antes de integrar.

## Não negociável — segurança e integridade

1. Não afirmar que o SIGA é 100% offline. A janela `school` é remota;
   `offline-shell` ainda não tem dados escolares.
2. Sem SQLCipher verdadeiro, sem SQLite de alunos/financeiro em disco:
   nenhuma base local não cifrada; sem fallback silencioso.
3. Cada operação e consulta de dados privados: `school_id`,
   `actor_id`, `device_id`, autenticação válida, RBAC/RLS e MFA
   conferidos no servidor e com expiração/revogação.
4. Nunca reenviar ou descartar uma operação `sending` ou
   `needs_verification` sem recibo transaccional por `op_id`.
   Timeout/reinício não equivalem a confirmação nem a falha definitiva.
5. Se o Stronghold falhar ao persistir, o pedido HTTP não deve sair.
   Não limpar um cofre corrompido ou reescrever vazio.
6. Separar capabilities: `main` e `quick-pane` locais;
   `offline-shell` com poucos comandos explícitos; `school` remoto
   **sem FS, shell, SQL, Store, Stronghold ou updater genérico**.
7. Nunca ampliar permissões para facilitar desenvolvimento, nem aceitar
   qualquer URL de destino livremente no portal.
8. Financeiro, emissão fiscal, alterações de permissões e acções
   sensíveis continuam online até idempotência e validação comprovadas.
9. Actualizador Tauri só assinado, com verificação de outbox e cofre no
   Rust **e** escritas React em curso.
10. Não publicar credenciais, chaves privadas, ficheiros de alunos ou
    segredos no repositório, logs ou cache não cifrada.

## Próximas fases: responsabilidades do agente

**Primeiro — integração limpa:** finalizar #316 sem perder as alterações
recentes do `main`; corrigir Prettier/TypeScript/Rust; verificar todos
os jobs do **último SHA** e só então merge sem force push.

**Depois — backend idempotente:** especificar e testar um recibo de sync
por `op_id + escola + actor + device + hash_payload`, com gravação
atómica do recibo e da mudança académica. Validar período, pertença,
permissões e conflito por `server_revision` dentro da transacção.
Ensaiar em staging isolado. Não aplicar produção sem revisão.

**Depois — SQLCipher nativo:** estudar compatibilidade Tauri v2/Rust e
lockfiles; chaves geridas nativamente, `PRAGMA cipher_version`,
bootstrap autenticado, migrações em transacção, recuperação e falha
fechada. Não adicionar API SQL genérica ao WebView.

**Depois — UI escolar realmente local:** mapear dependências das rotas
SSR/server functions TanStack Start, adaptar módulos progressivamente,
primeiro leitura de dados institucionais autorizados, depois lançamento
de presenças/notas com gestão explícita de conflitos e revogação.

**Depois — instalador:** Windows/macOS/Linux, WebView2 em modo instalador
offline, updates assinados, testes com duas escolas e dois utilizadores,
crash durante envio, perda/reconexão, vault locked, MFA expirada,
alteração de escola e restauração após falha.

## Regras de contribuição em paralelo

- Cada agente cria branch própria, PR pequena e commits descritivos.
  Não reescrever nem misturar branches de outro agente sem reconciliar.
- Ler diffs concorrentes da Skill, `AGENTS.md` e fluxos de notas e
  presença antes de alterar os mesmos ficheiros.
- Testar `node scripts/check-desktop.mjs`,
  `npm --prefix desktop run check:all`,
  `npm --prefix desktop run test:run`, TypeScript, Vitest geral, SQL/PGlite
  e `python3 -m unittest discover -s tests/tauri -p 'test_sqlite_schema.py'`.
  Testar `cargo fmt --check` e `cargo test --locked`/build na matriz
  Tauri aplicável. Confirmar resultados CI, não interpretar `skipped`
  como teste passado.
- Só fazer merge quando CI do último SHA concluir com sucesso; evitar
  deploy e migrações de produção sem ensaios e autorização específicos.
- Actualizar issue #289 e descrição da PR com concluído/pendente,
  riscos, instruções para reproduzir e testes físicos em falta.

**Definição de terminado:** escola executável offline com dados cifrados
e acesso autorizado, zero mistura de tenants, zero perdas/duplicados e
sync autenticada comprovada em dispositivos reais. Até lá, comunicar
restrições com precisão.
