# Actualização geral do SIGA + análise crítica

Âmbito acordado: apenas a aplicação SIGA (raiz), com foco em desempenho e qualidade.
Entrega: relatório escrito no projecto, mais correcções.

## O que foi medido agora (não são suposições)

| Verificação | Resultado |
| --- | --- |
| Testes automáticos | 120 ficheiros passam, 2 ignorados, ~11s |
| Verificação de tipos | 19 erros (matrículas, importação/exportação, Zoom) |
| Regras de código | 19 424 avisos: 19 287 são só formatação automática |
| Bibliotecas com alerta de segurança | 2 (ambas indirectas, sem correcção directa disponível) |
| Tamanho da aplicação | 520 ficheiros, 55 páginas |

Leitura crítica: os testes dão uma falsa sensação de saúde total. Existem 19 erros de
tipos reais em zonas sensíveis (registo/matrícula de aluno, motor de importação,
reunião online), e o ruído de formatação é tão grande que esconde os 126 avisos que
realmente importam (dependências de efeitos, tipos genéricos `any`, exportações mistas).

## Fase 1 — Relatório de análise crítica

Criar `docs/agents/CRITICAL_REVIEW_2026-09.md` com:

- Estado real por área: académico, matrículas, financeiro, importação, integrações.
- Riscos ordenados por impacto, com evidência (ficheiro e linha).
- Dívida técnica: onde o código cresceu sem consolidação.
- O que ainda é visual/simulado versus ligado a dados reais.
- Recomendações em três blocos: corrigir agora, corrigir a seguir, vigiar.

## Fase 2 — Correcções de qualidade

1. Corrigir os 19 erros de tipos, começando pelos de matrícula e registo de aluno
   (`src/features/students/server.ts`, `src/features/people/server.ts`), depois
   importação/exportação (`src/features/import/server.ts`) e reunião online.
2. Aplicar a formatação automática a todo o projecto para eliminar o ruído das 19 287
   marcas e passar a ver os avisos reais.
3. Rever os 38 avisos de dependências de efeitos e os 30 usos de tipo genérico nas
   zonas de dados (podem causar listas desactualizadas ou erros silenciosos).
4. Reduzir os 53 avisos de exportações mistas nos ficheiros de rota, que prejudicam a
   actualização rápida durante o desenvolvimento.

## Fase 3 — Bibliotecas

- Actualizar as bibliotecas com actualizações compatíveis e voltar a correr testes,
  tipos e verificação de estilo depois de cada bloco.
- Os dois alertas de segurança vêm de pacotes indirectos sem correcção publicada:
  ficam registados no relatório com o pacote de origem e a versão que os resolve,
  para reavaliar depois. Não se forçam mudanças que quebrem a aplicação.

## Fase 4 — Desempenho

- Medir o tempo até primeiro conteúdo e o atraso ao toque nas páginas mais usadas
  (painel, alunos, financeiro, pauta) com as ferramentas já existentes no projecto.
- Reduzir o peso inicial das páginas mais pesadas (gráficos, PDF, Excel) carregando
  esses blocos só quando são precisos.
- Ajustar a pré-carga de páginas ao resultado medido, sem alterar o aspecto.

## Fase 5 — Revisão visual de todas as páginas

- Passar pelas 55 páginas e uniformizar: estados vazios, estados de carregamento,
  mensagens de erro, alinhamento de ícones e comportamento das listas.
- Corrigir o que estiver fora do padrão, sem mudar a paleta nem o desenho aprovado.
- Registar no relatório as páginas que ainda mostram dados de exemplo.

## Ordem e validação

Cada fase termina com: testes, verificação de tipos, verificação de estilo e
confirmação de que as páginas continuam a abrir sem erros. Nada avança com erros
abertos.

## Notas técnicas

- Sem alterações de base de dados nesta actualização; nenhuma migração é aplicada
  (regra do projecto: SQL só por `npm run siga:sql`).
- Fora de âmbito: site comercial, painel de administração e documentação (`painel/*`).
- Ferramentas usadas: `vitest`, `tsgo`, `eslint`, `scripts/style-checklist.mjs`,
  `scripts/a11y-check.mjs`, Lighthouse já configurado.
