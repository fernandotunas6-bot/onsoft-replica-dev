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


## Fase 2 — Localização, filtros e vínculo docente

Implementação executada depois da primeira validação visual, mantendo o princípio aditivo e sem reescrever o SGA.

### Localização de Pessoas

- Foi criada uma migration idempotente que garante `province`, `municipality`, `commune` e `address` em `public.people`.
- Foram adicionados índices por escola/província e escola/província/município para os filtros operacionais.
- O servidor de Pessoas passou a persistir, devolver e filtrar estes campos.
- Enquanto a migration não estiver aplicada numa instalação antiga, leituras sem filtros territoriais mantêm fallback compatível; operações que tentem gravar localização falham com mensagem explícita em vez de perder dados silenciosamente.
- O catálogo local de províncias usa a divisão político-administrativa vigente com 21 províncias.
- Município e comuna permanecem texto livre nesta fase. Não foi inventado um catálogo municipal incompleto.

### Fluxos cobertos

- Nova Pessoa: província, município, comuna/localidade e morada detalhada.
- Matrícula interna: os mesmos campos são persistidos na pessoa criada.
- Matrícula pública: a escola pode activar os campos territoriais na campanha e a candidatura conserva estes dados.
- Aceitação de candidatura: a localização é transferida para a ficha de Pessoa.
- Lista de Pessoas: filtros persistentes por província e município.
- Perfil 360 da Pessoa e perfil do Aluno: passam a mostrar a localização persistida.
- Edição da Pessoa/Aluno: localização deixa de ser descartada.

### Vínculo professor → turma → disciplina

- O selector de atribuição docente foi convertido para o mesmo split-view do SIGA.
- A ordem passou a ser Turma → Disciplina → Professor.
- Quando a turma já tem currículo/`class_subjects`, só são mostradas as disciplinas ligadas a essa turma.
- Para preservar o fluxo legado, uma turma ainda sem currículo pode fazer a primeira atribuição; o backend continua a criar a ligação `class_subjects` com validação por `school_id`.
- Pautas e lançamento de notas já possuíam filtro de período/trimestre e disciplinas por turma; estes comportamentos foram preservados em vez de adicionar `term` artificialmente ao vínculo docente.

### Testes adicionados

- catálogo territorial de Angola;
- schema de Pessoas com filtros territoriais;
- candidatura pública com localização;
- perfil de aluno com localização;
- filtragem de disciplinas na atribuição docente;
- pgTAP para colunas e índices territoriais.
