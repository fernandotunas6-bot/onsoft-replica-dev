# Auditoria — Pessoas, Vinculações e Matrículas (2026-09-03)

## Escopo

Auditoria executada antes da alteração visual/funcional solicitada para unificar a experiência de Pessoas e Matrículas sem reescrever o SIGA Plus.

## Estado encontrado

- O SIGA já possui um núcleo de Pessoas em `src/features/people` e a regra operacional "uma pessoa, vários papéis".
- A matrícula interna já usa `StudentEnrollmentSheet` sobre `SequentialSheetModal`.
- A candidatura externa já existe em `/matricula/$slug` e cria candidatura pública com validações próprias.
- A estrutura académica real já expõe ano lectivo, curso, classe, turma, sala/campus, disciplinas, capacidade e contagem de matrículas através de `listPedagogicalWorkspace`.
- `enroll_student` é a operação atómica para colocar o aluno numa turma e valida capacidade/ano/estado.
- O isolamento multi-tenant actual é por `school_id`, com RLS/guards reforçados e service-role apenas no servidor.
- O esquema SGA de produção usado pelo código não persiste ainda todos os campos territoriais aceites pelo schema de UI (por exemplo, província/município/comuna/endereço no fluxo principal de `createPerson`). Portanto, esses filtros não devem ser simulados no frontend até existir persistência canónica.

## Decisões desta fase

1. Não criar banco novo, não remover migrations e não alterar o modelo multi-tenant nesta fase.
2. Reutilizar `WizardModal`, `SequentialSheetModal`, `StudentEnrollmentSheet`, `PersonWizardModal` e `/matricula/$slug`.
3. Criar uma linguagem visual própria do SIGA, inspirada apenas na estrutura "ilustração à esquerda + tarefa à direita", sem copiar marca/arte do Zoom.
4. Transformar o modal de processos longos em split-view apenas quando um painel visual for fornecido; restantes modais permanecem intactos.
5. Melhorar a matrícula interna com filtros hierárquicos derivados de dados reais: ano lectivo → curso → classe → turno/sala → turma.
6. Exibir capacidade e ocupação reais da turma quando disponíveis.
7. Não adicionar select de província/município sem persistência server-side correspondente.

## Riscos identificados

- `people` continua school-scoped; tornar identidade verdadeiramente global entre escolas exige desenho separado de identidade/membership e não deve ser feito como refactor visual.
- O campo `address` é aceite no formulário mas o servidor actual não o persiste na tabela SGA principal; isso deve ser corrigido em fase de dados, com SQL canónico, antes de ampliar filtros geográficos.
- O selector de encarregado recebe inicialmente uma janela limitada de pessoas. A evolução correcta é pesquisa server-side, não carregar milhares de registos num `select`.
- Alterar `WizardModal` pode afectar muitos fluxos; por isso o novo split-view é opt-in.

## Implementação desta fase

- Novo componente visual reutilizável: `EducationWorkflowVisual`.
- `WizardModal` ganha painel visual opcional.
- `SequentialSheetModal` passa o painel visual por etapa.
- `StudentEnrollmentSheet` adopta o novo visual e filtros académicos hierárquicos.
- `PersonWizardModal` adopta o split-view premium.
- `/matricula/$slug` adopta a mesma linguagem visual externa, preservando identidade da escola e integrações.
- Testes unitários de renderização do novo componente.

## Próxima fase recomendada

Depois de validar UI/build/CI:

1. Persistência territorial canónica (província, município, comuna, morada) no SGA real.
2. Selector universal de pessoas com pesquisa server-side e paginação.
3. Vínculos institucionais explícitos para papéis múltiplos sem duplicação.
4. Filtros de disciplina/período em fluxos onde são semanticamente necessários (atribuição docente, pauta, horário), sem forçar esses campos na matrícula simples.
