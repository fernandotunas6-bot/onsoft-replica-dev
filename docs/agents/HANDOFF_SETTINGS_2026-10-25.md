# SIGA Plus — passagem de trabalho ao Claude Code (25/10/2026)

## Contexto confirmado

Repositório: `fernandotunas6-bot/onsoft-replica-dev`. Esta contribuição começou
no `main` `48fb87cdda990a8e159cd92df6adf222384101aa` (25/10/2026).
As PRs #272 (distância do botão Fechar) e #274 (flyouts contextuais da escola)
já foram integradas; os trabalhos de navegação e acesso dos perfis das PRs
#281/#282 também constam do histórico do `main`. Não repor versões antigas desses ficheiros.

Contrato obrigatório: `AGENTS.md`,
`docs/design/VISUAL_MASTER_2026.md` e
`docs/design/SIGA_VISUAL_MASTER_2026-10-23.md`.

## Entrega deste ramo

Branch: `fix/settings-panels-handoff-20261025`.

* `src/components/modals/SettingsCenter.tsx`: os painéis já registados
  `identidade` (Identidade Digital) e `pedagogico` (Pedagógico) passam a ter
  destinos explícitos nas categorias principais. Sem criar módulos, substituir
  componentes, alterar permissões ou intervir no Supabase.
* `tests/ui/settings-panel-reachability.test.ts`: protege os dois acessos, a
  existência dos destinos e a ausência de painéis sem entrada na árvore.
  É um **contrato estático**; os ensaios funcionais do `StackedModal` continuam
  em `tests/ui/stacked-settings.test.tsx`.
* A página de configurações continua o padrão por omissão. A apresentação modal
  só funciona mediante preferência institucional já existente.

## Claude Code — instruções para a próxima execução

1. Ler os contratos acima e verificar o `main` e a head da PR antes de editar;
   comparar diffs com trabalhos paralelos. **Não fazer force-push ou rebase**
   de ramos publicados ligados ao Lovable.
2. Rever esta alteração e certificar que Identidade Digital e Pedagógico são
   realmente navegáveis a partir de `/configuracoes` com perfil Administrador
   e que os deep links `?painel=identidade` e `?painel=pedagogico` abrem a
   categoria certa. Não alterar `resolveTopId` sem teste.
3. Executar `bun run lint`, `bun run typecheck`,
   `bun test tests/ui/settings-panel-reachability.test.ts tests/ui/stacked-settings.test.tsx tests/routes/configuracoes.test.tsx`,
   `bun run build` e `bun audit --audit-level=high`; registar resultados
   reais, sem assumir que a criação da PR prova o CI.
4. Validar a apresentação no desktop e em larguras 390, 768, 1024 e 1440 px,
   incluindo teclado, Escape, foco, scroll e título longo. Confirmar com
   duas escolas de ensaio que domínios, configurações académicas e navegação
   não mostram dados da outra instituição. Se não houver staging autenticado,
   marcar QA como pendente; não usar dados de produção para inventar evidências.
5. Se houver melhorias de UX para manter as configurações da escola no mesmo
   contexto, propor uma alteração própria e pequena, conservando os painéis
   existentes, os direitos do Administrador, o estado dos formulários e os
   guardas de perda de rascunhos.
6. Verificar o estado actual da issue #273: a execução anterior da PR #272
   encontrou avisos high em dependências. Não ignorar auditorias nem forçar
   `zod` v4 sobre esquemas v3 sem teste de migração. Se o `main` mudou,
   recolher auditoria nova e actualizar a issue com a evidência.
7. Só recomendar merge e deploy quando checks estiverem verdes e os ensaios
   autorizados estiverem concluídos. Não aplicar SQL, pagamentos nem Cloudflare
   como efeito colateral de uma alteração visual.

## Exclusões e comunicação entre agentes

Esta intervenção não envolve Flutter, Payflow, backend, migrações, RLS ou
publicação em Cloudflare. Não sobrescrever contribuições independentes.
Claude deve deixar comentários com achados verificáveis na PR e preparar
commits adicionais pequenos em ramo próprio caso o escopo cresça. Esta nota é
um **handoff documental**, não inicia uma sessão do Claude automaticamente.

## Continuação após o merge da PR #286 — protecção de rascunhos (25/10/2026)

A PR #286 foi integrada no `main` no commit `50b90afe`. O trabalho de
Identidade Digital e Pedagógico está entregue; não voltar a abrir o mesmo PR.

Ramo deste incremento: `fix/settings-external-deeplink-dirty-20261025`.

**Problema encontrado:** `StackedModal` confirmava a perda de alterações
quando o utilizador clicava noutra categoria, mas o `useEffect` de
`initialPanelId` mudava o painel sem a mesma confirmação. Um deep link
externo podia, portanto, trocar o formulário activo e perder edições.

**Correcção:** a mudança externa compara o painel de topo resolvido com o
painel actualmente visível, consulta a mesma guarda `confirmDiscardChanges`
se houver secções dirty e só troca e limpa o estado após consentimento.
Uma recusa deixa o formulário original aberto. O efeito não depende
directamente de `activeId` para não desfazer a navegação manual; o ref
é sincronizado em `useEffect` e não durante o render.

**Regressão:** `tests/ui/stacked-settings.test.tsx` exercita recusa
e aceitação numa mudança de `initialPanelId`, preservando o teste original
de cliques nas categorias.

**Claude Code, próximo passo:** rever o diff e executar lint, typecheck,
Vitest, build, auditoria de dependências e ensaio de browser autorizado.
Validar a combinação de rascunhos, clique, `?painel=`, histórico do router
e alternância entre escolas. Atenção particular a links para subpainéis
(`conta.perfil` e `conta.senha`) e a regressões com React StrictMode.
Não alterar RLS, SQL nem publicação de produção.

A issue #273 foi encerrada depois de a auditoria da PR #286 passar e
de as versões corrigidas constarem do lockfile. Reabrir apenas perante
nova evidência. Os testes DOM/CI não substituem homologação autenticada.
