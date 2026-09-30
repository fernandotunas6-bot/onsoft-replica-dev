# Análise crítica do SIGA — Setembro 2026

Âmbito: aplicação SIGA (raiz do repositório). Fora de âmbito: `painel/web` (WEB),
`painel/admin` (ADMIN), `painel/docs` (DOC).

## 1. Estado actual (medido)

| Indicador                | Antes desta revisão                                     | Depois                       |
| ------------------------ | ------------------------------------------------------- | ---------------------------- |
| Erros de tipos (`tsgo`)  | 19                                                      | **0**                        |
| Problemas ESLint (SIGA)  | 19 424 (contando `painel/*`)                            | **39 avisos, 0 erros**       |
| Testes (`vitest run`)    | 861 passam / 2 ignorados                                | 861 passam / 2 ignorados     |
| Ficheiros TS/TSX em `src`| 520 (~4,1 MB)                                           | 520                          |
| Páginas (`src/routes`)   | 28 rotas de topo + subrotas dinâmicas                   | idem                         |
| Dependências vulneráveis | 2 indirectas (sem correcção publicada a montante)       | idem (documentadas em §5)    |

Notas de medição: a contagem antiga de ~19 400 avisos incluía os três painéis do
ecossistema, que têm configuração de lint própria. O ESLint da raiz passa agora a
analisar apenas o SIGA (`eslint.config.js`), pelo que os números são comparáveis
com o que a equipa realmente mantém neste repositório.

## 2. Riscos por ordem de importância

1. **RPCs sem tipos gerados** — `src/integrations/supabase/types.ts:72` expõe
   `Functions: { [_ in never]: never }`, logo todas as chamadas
   `register_student` / `enroll_student` / `register_payment` passam pelo cliente
   não tipado `sgaClient` (`src/integrations/supabase/sga.ts`). Consequência: erros
   de assinatura só aparecem em execução. Mitigação actual: validação Zod nas
   entradas dos server functions (`src/features/*/schemas.ts`).
2. **Convenção de SQL fora do fluxo automático** — o schema é aplicado à mão
   (`supabase/APPLY_IN_SQL_EDITOR.sql`, `APPLY_ENROLLMENT_AND_PREMIUM.sql`;
   ver `supabase/DO_NOT_APPLY_TO_SGA.txt`). Qualquer nova coluna exige passo manual;
   é a maior fonte de divergência entre ambiente e código.
3. **Dependências vulneráveis indirectas** — `js-yaml` via
   `@tanstack/react-start@1.168.32` (alta) e `uuid` via `exceljs@4.4.0` (moderada).
   Nenhuma tem correcção directa disponível; nenhuma é usada em caminho exposto a
   entrada de utilizador não autenticado.
4. **Componentes muito grandes** — `src/features/academic/AssessmentCenter.tsx`
   (>1 000 linhas) e `src/features/pedagogica/components/pautas/PautasWorkspaceModule.tsx`
   (~940 linhas) concentram estado, cálculo e apresentação. São o ponto mais provável
   de regressões e de lentidão percebida na digitação de notas.
5. ~~**Dados de demonstração misturados com dados reais**~~ — **resolvido**: sem turma
   real a pauta fica vazia e mostra o estado "sem turma/sem alunos". Os documentos
   fictícios passaram para `tests/pedagogica/pautas-fixtures.ts` (2026-09-29).

## 3. Dívida técnica remanescente (39 avisos)

- 32 × `react-refresh/only-export-components`: ficheiros que exportam componentes e
  constantes/funções em conjunto. Só afecta a recarga rápida em desenvolvimento.
- 7 × `react-hooks/exhaustive-deps` restantes, todos analisados e considerados
  intencionais ou de baixo impacto (`CameraCaptureModal.tsx:79`,
  `AssessmentCenter.tsx:645/1043`, `FileCoverTile.tsx:54`, `SpotlightRail.tsx:48`,
  `use-inbox-unread.ts:64`, `settings-school-panel.tsx:161`).

## 4. Correcções aplicadas nesta revisão

- 19 erros de tipos eliminados (RPCs via `sgaClient`, motor de importação/exportação,
  gerador de modelos Excel, botão de aula Zoom).
- Formatação normalizada em todo o `src`, `tests` e `scripts`.
- Recálculos desnecessários removidos: listas derivadas de consultas passaram a ser
  memoizadas em pautas, avaliações, pedagógica, calendário, comunicações, acessos,
  relatórios académicos, mensagens, integrações e conta actual. Isto elimina
  recomputação de pautas inteiras a cada tecla escrita nos filtros.
- Dependências de hooks corrigidas na barra lateral, no painel de perfil e nas pautas
  (evita menus e conversas com estado desactualizado).
- `require()` substituído por importação estática no SAF-T
  (`src/features/finance/server.ts`).
- Tipos genéricos (`any`) removidos do código da aplicação; mantidos apenas onde o
  dado é JSON arbitrário de folhas importadas, com justificação no local.
- Ficheiros de rascunho removidos da raiz (`patch.cjs`, `patch_types.cjs`,
  `fix_trigger.sql`).
- ESLint da raiz limitado ao SIGA e a ficheiros gerados excluídos.

## 5. Recomendações

**Corrigir a seguir**

- Dividir `AssessmentCenter.tsx` e `PautasWorkspaceModule.tsx` em módulos de estado,
  cálculo e apresentação.
- Medir FCP/INP nas páginas de pautas, avaliações e financeiro e carregar sob demanda
  os gráficos, PDF e Excel.

**Vigiar**

- Novas versões de `@tanstack/react-start` e `exceljs` para fechar as duas
  vulnerabilidades indirectas.
- Geração de tipos das RPCs assim que o projecto de base as expuser.
- Avisos `react-refresh` ao criar novos componentes (separar constantes em ficheiro
  próprio desde o início).
