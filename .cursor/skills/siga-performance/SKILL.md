---
name: siga-performance
description: >-
  Audit and improve responsiveness, loading, cache, queries and existing visual
  consistency in the SIGA Plus repository. Use for speed, latency, touch response
  or surgical visual refinement requests. Preserve features, dimensions and identity.
---

# SIGA Plus — desempenho e refinamento cirúrgico

Aplicar apenas no projecto SIGA Plus (`onsoft-replica-dev`). Ler `AGENTS.md`,
`docs/agents/ARCHITECTURE_HARMONIZATION.md` e o handoff antes de alterar código.
O pedido original está em [references/prompt-master.md](references/prompt-master.md).

## Contrato do dono

- Prioridade: resposta rápida ao toque, velocidade, estabilidade e organização interna.
- Não acrescentar nem remover funcionalidades, módulos, botões, cartões, menus,
  painéis ou decoração. Não aumentar dimensões, densidade ou o tamanho da interface.
- Preservar logótipo, Inter, cores, gradientes, ícones, animação institucional,
  layouts e percursos. Corrigir só falhas demonstradas de alinhamento, contraste,
  responsividade, sobreposição, saltos ou comportamento de componentes existentes.
- Manter WEB, ADMIN, SIGA, PAYFLOW e DOC com as responsabilidades e frameworks actuais.
  Organização interna não significa mudar o menu ou reconstruir a arquitectura.
- Não alterar regras académicas/financeiras, RBAC, MFA, RLS, auditoria ou isolamento.
  Nenhuma conclusão optimista de pagamentos, notas finais ou operações críticas.

## Como trabalhar

1. Registar alterações pré-existentes e preservar o trabalho do utilizador. Inventariar
   os módulos realmente presentes; não implementar módulos só porque aparecem no prompt.
2. Medir antes de alterar: distinguir compilação de desenvolvimento, build de produção,
   cache fria/quente, sessão autenticada e ambiente sintético. Não atribuir percentis
   reais de INP/LCP a um teste de laboratório nem anunciar ganhos sem comparação.
   Medir recursos iniciais pelo manifesto SSR actual: a pasta `.output/public/assets`
   pode conservar hashes de builds antigos, e somá-los falseia o tráfego de arranque.
3. Priorizar gargalos partilhados comprovados: imports iniciais, router/pré-busca,
   cache React Query, subscrições, listas/formulários e chamadas redundantes. Reutilizar
   as ferramentas existentes; dependências, workers ou infra novos exigem justificação.
4. Pré-busca deve usar as mesmas chaves, parâmetros e permissões do consumidor, respeitar
   a escola/conta/ano lectivo e ligações limitadas. Permitir nova tentativa após falha,
   invalidação e limpeza de sessão. Não guardar dados privados em cache pública.
5. Juntar rajadas Realtime sem perder eventos, nem deixar timers/listeners após desmontar.
   Evitar pedidos obsoletos e respostas antigas sobre dados recentes. Não esconder erros.
6. Consultas Supabase: ler `DATABASE_RULES.md` e a skill do módulo; confirmar campos no
   snapshot. Tipos escolares em `types.sga.ts`, nunca alterar clientes Lovable para
   optimizar. Inspeccionar planos/índices antes de propor SQL; não aplicar SQL ou
   alterar produção apenas por este pedido de performance.
7. Testar regressões observáveis: pedidos contados, reutilização/isolamento da cache,
   cancelamento, falhas/retentativas, permissões e desmontagem. Verificar dimensões
   e funcionalidades preservadas; movimento reduzido e dispositivos modestos.
8. Repetir medições comparáveis, executar checks adequados e documentar o que foi
   medido, corrigido e o que continua sem validação. Não declarar auditoria autenticada,
   multi-dispositivo ou de produção completa quando não foi executada.

Metas de referência do dono: feedback <100 ms, INP p75 ≤200 ms, LCP p75 ≤2,5 s,
CLS ≤0,1. São objectivos sujeitos a medição, não garantias nem motivo para sacrificar
segurança. Feedback imediato usa os componentes existentes; só o servidor confirma
uma operação concluída.

## Pontos existentes a consultar

- `src/router.tsx`: defaults React Query e TanStack Router.
- `src/lib/route-data-prefetch.ts`, `preload.ts`, `warm-charts.ts`: pré-busca.
- `src/lib/realtime-invalidate.ts`: agrupamento de invalidações.
- `src/lib/performance-supervisor.ts`, `vitals.ts`: diagnóstico existente.
- `src/features/auth/use-current-account.ts`, `use-sign-out.ts`: sessão/escola.
- `scripts/siga/modules.json`: inventário canónico; skills `siga-*` por módulo.
- `tests/ui/first-paint-budget.test.ts`: limites do primeiro desenho.
- `scripts/siga/performance-inventory.mjs`: bytes/preloads do build e inventário por módulo.
- Armadilha da raiz: `__root.tsx` monta `AppearanceProvider`, `RouteAccessGate`,
  `use-school-settings` e `tenant-context`, por isso **tudo** o que estes importam de
  forma estática entra nos 36 recursos pré-carregados. Antes de importar um catálogo
  ou tabela de dados num destes caminhos, confirmar o peso no manifesto SSR; um
  `.find()` não justifica 110 KB no arranque. Guardas em `tests/ui/first-paint-budget.test.ts`.
- Armadilha da rota, maior do que a da raiz: os 36 recursos são do `__root__`, **não
  da página**. A rota `/` tem a sua própria lista no manifesto e soma 73 ficheiros
  (1 567 114 bytes) — e o `/` é o painel, que desenha o login a quem não tem sessão.
  Optimizar a lista de 36 pode não mexer nada no ecrã que todos vêem. Ler sempre
  `routes["/"].preloads`, não só `routes.__root__.preloads`.
- Armadilha do `lazy()` anulado por um import estático: o manifesto pré-carrega o grafo
  **estático** da rota. Importar uma peça pequena (um esqueleto, um tipo com valor, uma
  constante) de um módulo que importa biblioteca pesada põe esse módulo nos recursos da
  rota, e o navegador segue os imports estáticos dele até à biblioteca. Foi assim que
  370 KB de `recharts` entravam no login apesar do `lazy()`. Diagnóstico por contraste:
  comparar a lista da rota suspeita com rotas que usam a mesma biblioteca só por
  `lazy()` — se só uma tem o pedaço, é uma aresta estática. Correcção: a peça pequena
  vai para um módulo sem imports.
- `scripts/siga/performance-browser.mjs`: ensaio local sem sessão; login/registo, frame
  de feedback, dimensões e erros. Requer Chrome; `SIGA_PERF_BASE_URL` escolhe o alvo e
  o `kind` do relatório distingue desenvolvimento de build de produção. Não substitui
  a validação autenticada. Evidências em `docs/performance/2026-10-19/relatorio.md`.
- Medir o build de produção neste Mac: `wrangler` exige macOS 13.5+ e `vite preview`
  procura `dist/server/`, que o projecto não usa. Funciona
  `SIGA_NITRO_PRESET=node-server npm run build` e servir `.output/server/index.mjs` por
  Node. O pacote do cliente é igual nos dois presets; a variável nunca entra num
  workflow de publicação. Números de desenvolvimento não valem como medição.

Usar Node 24. Para comprovar comportamento correr testes dirigidos, tipos, lint e
build; expandir a suite quando a mudança partilhada o justificar. Não fazer deploy,
aplicar migrações ou escrever em escolas reais como parte de uma medição local.
