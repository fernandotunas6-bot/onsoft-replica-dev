# Secções verticais — 30/10/2026

Base: `origin/main` em `6e4aed38`. Ramo: `refine/vertical-module-navigation-20261030`.
Pedido: substituir a barra horizontal de secções por navegação vertical à esquerda e repetir nas páginas equivalentes.

## Implementação

`Tabs layout="sidebar"` mantém o contrato Radix, orientação vertical, foco e relações ARIA. `TabsPanels` reúne os painéis e ferramentas à direita. Menu com indicador lateral activo, nomes que podem quebrar linha, scroll próprio e posição sticky no desktop. Abaixo de 1024 px o menu mantém orientação vertical, acima do conteúdo, com altura limitada e scroll.

Aplicado em 12 consumidores: Pedagógica, Ensino Superior, Perfil, Importar, Alumni (directório, ficha, insights, operações, pipeline e portal), perfil do professor e catálogo educativo. Os grupos académicos existentes continuam presentes. Separadores compactos dentro de cartões, formulários e modais conservam o seu formato e o contexto de Tabs é isolado em cada raiz.

## Matriz

| Área | Estado | Evidência | Contrato/perfil | Próximo passo |
| --- | --- | --- | --- | --- |
| Componente partilhado | validado localmente | testes de clique, teclado, destino desactivado, ARIA e Tabs aninhados | Sem alteração de endpoint ou permissões | Rever CI |
| 12 consumidores | implementado; regressões locais validadas onde há testes | 56 testes em 11 ficheiros | Contratos e filtros de acesso existentes | Ensaio autenticado no staging |
| Responsividade | validado no ensaio controlado | Chromium a 390, 767, 768, 1023, 1024 e 1440 px; posição relativa, sem overflow da página, clique entre secções | Componente e CSS reais com conteúdo fictício | Conferir páginas completas autenticadas e dispositivos físicos |
| Tipos / lint / build | validado localmente | typecheck e build passaram; lint sem erros, 58 avisos | Sem SQL, backend ou infraestrutura | CI da PR |
| Produção | por publicar | Nenhum deploy neste incremento | Publicação independente | Integrar após revisão |

A fixture visual temporária não substitui um ensaio autenticado da escola. Não foram criados alunos, matrículas, notas ou pagamentos. Nenhuma alteração a RLS, MFA, sessão ou cálculos.

## Continuação — auditoria e refinamento local

- **Corrigido:** a revelação do separador activo usava `scrollIntoView` e podia deslocar os antepassados, incluindo a página. Agora `revealVerticalTab` ajusta apenas `scrollTop` da lista vertical. Mudanças externas de secção e redimensionamentos também revelam o destino; os observadores são desligados ao desmontar. Eliminada a implementação duplicada de Pedagógica.
- **Corrigido:** texto activo sobre o fundo primário translúcido mediu 4,31:1 no tema claro. Usa agora o token de texto `--primary-strong`, conservando os tokens da marca. Medição do componente real no Chromium: **6,65:1 claro / 7,92:1 escuro**, após estabilizar transições. Esta medição não certifica todas as combinações de temas personalizados da escola.
- **Corrigido:** nomes sem espaços quebram linha e ícones não encolhem. O scroll do menu fica contido na lista.
- **Expandido:** Perfil modal, Identidade Digital e Aparência adoptam o padrão, totalizando 15 consumidores de `layout="sidebar"`. A ficha de Pessoas já era vertical no computador; `ModalSidebar` conserva agora a lista vertical também no telemóvel, sem truncar os nomes. A selecção Ano/Trimestre no cartão de notas continua um controlo compacto dentro do cartão.

### Validação desta continuação

- `npx vitest run tests/ui ...` com as rotas afectadas e contratos de navegação, perfil, Pessoas, aparência e identidade: **76 ficheiros aprovados; 557 testes aprovados; 6 ignorados**. Os seis ignorados pertencem às três excepções preexistentes de bordas decorativas em dois temas (`theme-token-contrast.test.ts`); não foram convertidos em aprovações nem alterados neste incremento.
- Novos testes cobrem scroll para cima/baixo, destino já visível, mudanças externas sem roubar foco, preservação de refs, isolamento dos separadores aninhados e teclado da ficha de Pessoas.
- `npm run typecheck` e `npm run build`: aprovados. ESLint nos ficheiros alterados: aprovado.
- `node scripts/qa/vertical-navigation.mjs`: ensaio reproduzível com componente e CSS reais, dados sintéticos e servidor temporário. Confere 390/767/768/1023/1024/1440 px, ausência de overflow da página, posição do menu, troca de secção, teclado, nomes extensos, modo escuro, movimento reduzido e contraste do texto activo. Requer Chromium do Playwright instalado. Não usa sessão nem contacta APIs institucionais.

### Limites e pendências

Este incremento audita navegação e componentes partilhados. **Não é uma auditoria integral de funcionamento académico ou financeiro.** Horários, matrícula real, notas persistidas, cobranças e pagamentos continuam a exigir ensaios próprios autorizados no staging; os testes de apresentação não provam RLS, MFA nem isolamento remoto.

A tentativa de push do commit anterior foi rejeitada pela revisão automática por exigir autorização explícita para enviar código a `fernandotunas6-bot/onsoft-replica-dev`. Sem nova autorização explícita, esta continuação permanece local: nenhuma tentativa alternativa de envio, nenhuma PR e nenhum deploy.
