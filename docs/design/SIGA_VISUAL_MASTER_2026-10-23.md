# SIGA Plus — contrato mestre de refinamento visual (23/10/2026)

## Fonte e precedência

Consolidação fiel das instruções do proprietário, do contrato `.cursor/skills/siga-performance/references/prompt-master.md`, do trabalho já publicado na [PR #252](https://github.com/fernandotunas6-bot/onsoft-replica-dev/pull/252) e da contribuição paralela já integrada no `main` pela [PR #259](https://github.com/fernandotunas6-bot/onsoft-replica-dev/pull/259). O texto integral da conversa/prompt privado do outro agente **não está acessível** nesta sessão; este documento coordena apenas orientações e artefactos efectivamente recuperados. Não alegar sincronização em tempo real nem substituir os commits do agente paralelo.

### Regra mestra

**Refinar e simplificar o existente, sem substituir, remover nem acrescentar funcionalidades.** Preservar rotas e URLs, contextos escolares, perfis, permissões, MFA, RLS, pagamentos, documentos, estado dos formulários, identidade, cores, fontes e preferências do utilizador. Não alterar o modelo de dados nem publicar migrações por trabalho visual.

## Sidebar — fonte canónica para novas iterações

1. Sidebar principal compacta, contextual por módulo/papel/escola, baseada no catálogo autorizado existente. Navegação global em «Todas as áreas»; contexto activo estável nos detalhes, parâmetros e subpáginas.
2. Desktop: **lado esquerdo recto e encostado ao ecrã**. O lado direito, voltado ao conteúdo, conserva a transição **côncava/inversa para dentro** na superfície principal (referência conceptual Stripe), sem espaços entre superfícies. Não arredondar a margem exterior esquerda da sidebar.
3. Mostrar primeiro o indispensável ao contexto; agrupar operações secundárias, sem esconder nem eliminar destinos autorizados. «Financeiro», «Secretaria», «Académico», etc. mantêm a associação correcta por perfil. O catálogo de links e a protecção das rotas continuam uma fonte única.
4. **Menu compacto por padrão.** Depois de recolher a barra, não reabrir menus por hover; expandir somente por comando explícito. As alternativas de densidade por escola devem reutilizar preferências e permissões existentes. Manter tooltips, teclado, Escape, aria-current, foco visível e toque.
5. No telemóvel, manter uma gaveta de navegação simples que fecha após seleccionar um destino; não deixar contexto antigo, não criar segunda árvore de autorização; nunca permitir overflow horizontal.
6. Respeitar tema claro/escuro, movimento reduzido, tamanhos 390/768/1024/1440px e nomes longos. Não introduzir gradientes, sombras intensas, duplicação de cabeçalhos nem rótulos burocráticos.

**Trabalho paralelo integrado:** a PR #259 corrigiu o destaque da área activa nos detalhes e no menu mobile e já foi integrada no `main` no commit `86920d3`. Preservar esses componentes e os contratos de navegação; qualquer novo refinamento deve partir do código actual e passar pelos testes de permissões e navegação.

## Modais — apenas os simples e necessários

1. **Não criar novos sistemas de modais.** Reutilizar `Dialog`, `AlertDialog`, `Sheet`, `ModalShell` e os formulários já existentes. Não converter sem inventário os processos completos (matrículas, pagamentos, geração de documentos) em confirmações curtas.
2. Quando a tarefa for simples, mostrar **título breve, informação necessária e duas acções claras no máximo** («Cancelar» e «Guardar»/«Confirmar»), se os fluxos já as suportarem; evitar parágrafos supérfluos, cartões decorativos, blur, zoom, sombras fortes, subdiálogos e animações que não ajudem.
3. O conteúdo extenso deve continuar a ter scroll, campos e validações acessíveis. Acções raras podem ser agrupadas em menus existentes ou aceder a páginas próprias quando já houver rota definida. **Não suprimir campos, passos de confirmação de operações sensíveis nem opções com significado jurídico/financeiro.**
4. Preservar foco inicial e retorno ao gatilho, `Escape` e fecho, acessibilidade Radix, 44px nos controlos de toque críticos, prevenção da perda de rascunhos e bloqueio ao guardar. `AlertDialog` de destruição mantém a sua prioridade e contraste.
5. Simplificação partilhada significa ajustar classes visuais dos diálogos correntes — sem alterar props, `onOpenChange`, portais, guards ou semântica. As excepções de formulários longos e críticos mantêm tamanhos próprios.
6. **Definições preferencialmente numa página**, não num modal sobre o painel. A rota `/configuracoes` existe, mas actualmente encaminha para `SettingsCenter` modal. Uma conversão futura deve preservar `?painel=`, acesso por papel/escola, rascunhos e todos os separadores; não misturar essa alteração funcional com um ajuste visual simples.

## Critérios para integrar

- Comparar o diff da PR #259/branch mais recente e a base de `main` antes de modificar sidebar.
- Conservar o diálogo como Radix modal com fecho de 44px, título/descrição, foco por teclado, conteúdo rolável e controles acessíveis.
- Passar lint, TypeScript, Vitest, build e auditoria de dependências; realizar, quando possível, provas visuais em 390/1024/1440px.
- Não afirmar homologação com contas reais nem isolamento multi-escola sem ensaio autenticado num staging isolado (issue #249).
- Não fazer merge ou publicar um trabalho de outro agente só por existir; revisão e evidência são obrigatórias.

## Referências do repositório

- `AGENTS.md` e `.cursor/skills/siga-performance/SKILL.md`
- `docs/design/CONTEXTUAL_VISUAL_INTEGRATION.md`
- `docs/visual/2026-10-23/spec-compliance/README.md`
- `docs/qa/sidebar-alignment-2026-10-23/README.md` da PR #259
- `tests/routes/sidebar-nav.test.tsx` e `tests/ui/modal-shell.test.tsx`
