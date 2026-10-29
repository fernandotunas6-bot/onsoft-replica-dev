# SIGA Plus — Perfil 360.º do Professor (29-10-2026)

## Objectivo

Consolidar o cadastro pessoal, a actividade lectiva e o vínculo laboral de um
docente numa única ficha **contextual por escola**, sem clonar entidades,
reescrever salários ou multiplicar sidebars. Referência de composição: ficha
`/pessoas/$personId`. Contratos visuais: `docs/design/VISUAL_MASTER_2026.md`
e `docs/specs/SIGA_CONTEXT_ENGINE_2026.md`.

## Fontes de verdade e limites

| Informação | Fonte actual | Regra |
| --- | --- | --- |
| Identidade, foto, telefone, BI, documentos | `people` e a ficha Pessoas | Não duplicar CRUD da pessoa no perfil docente |
| Número docente e estado | `teachers` na escola activa | Não confundir estado da pessoa com vínculo docente |
| Turmas, curso, classe, disciplina | `getTeacherWorkspace` | `class_groups` → `grade_levels` → `programs`; professor vê apenas o seu âmbito |
| Horário previsto | `getTeacherWorkspace.schedule` | É plano, nunca prova de realização |
| Chamada de hoje do próprio | `TeacherTodayLessonsPanel` | Nunca apresentar sessões do utilizador como sendo de outro docente |
| Cargo, contratos e faltas | `getTeacherHrEmployment` + `getHrEmployeeDetail` | Apenas Administração/Tesouraria conforme guarda do servidor |
| Salário, descontos e folha | `getHrEmployeeDetail` | Estado real do processamento, não inferir «pago» |
| Contexto institucional | `school.pedagogy.teachingLevels` | `school.institution.school_type` é natureza jurídica, não nível |
| Ano lectivo | `useSchoolSettings` | Os dados recebidos têm de ser validados quanto ao ano; não presumir que o horário é do ano seleccionado |

Um docente pode ensinar em várias instituições com vínculos independentes.
O mesmo indivíduo não tem de ter o mesmo cargo, salário, turmas, créditos,
calendário ou permissões em escolas diferentes. Os dados nunca são agregados
entre escolas; trocar de escola exige recarregar tudo e o servidor filtra
`school_id`. O perfil continua a declarar `EntityFocus` no motor existente,
com entrada de RH ligada ao vínculo da escola activa.

## Navegação visual

**Topo:** fotografia e identificação, vínculo activo, escola, ano e acções
existentes (editar, desligar, atribuir disciplina, imprimir credenciais, ICS).

**Área principal:** visão geral; aulas de hoje; cursos/disciplina; avaliação
e tarefas; contrato e cargo; salário/pagamentos; histórico. Tabulação compacta
em página, sem sidebar adicional. Cartões apenas onde ajudam a comparar.

**Área académica:** agrupamento real por curso → classe/turma → disciplina;
pauta, trabalhos, plano de aula, presenças, materiais, horário. Não criar
atalhos que pareçam executar pagamentos, emitir declarações ou gravar notas
sem passar pelo CRUD existente.

**Área RH:** separadores protegidos por cargo e endpoint; salários e motivos
de faltas não entram no payload de quem não consulta o RH.

**Estados:** loading, vazio, erro e permissão negada explícitos; indicadores
de agenda previstos, não «aula concluída» sem registo oficial.

## Variação pelos níveis

- Iniciação: actividades, observações de desenvolvimento, acompanhamento e
  contactos autorizados de encarregados, onde o módulo exista.
- Primário: planos de aula, turmas, presenças e avaliações.
- I Ciclo: pautas, provas, disciplinas e acompanhamento.
- II Ciclo / médio: organização por curso, turmas, disciplinas, provas e
  estágios se a instituição tiver módulo de estágio.
- Superior: cursos, cadeiras, semestres, créditos, inscrições, frequência,
  épocas de exame e pautas, recorrendo a rotas de ensino superior existentes.

Uma escola pode combinar níveis; o contexto específico do professor deve
vir das atribuições verificadas. Não activar uma acção sem serviço e permissão.

## Entregue nesta PR (primeira iteração)

- Conteúdo de perfil 360 com separadores responsivos e cartões de síntese;
  mantém intactos os modais e operações já existentes na rota.
- Utiliza níveis associados às classes reais; não confunde «privada» com
  «superior» nem assume nível de uma turma ambígua.
- Agrupa disciplinas pelo curso real devolvido por `getTeacherWorkspace`.
- Mostra os tempos previstos hoje em Africa/Luanda; para a própria ficha
  usa o componente já validado de chamada docente.
- Consulta RH apenas a quem tem permissão e só ao abrir a secção, usando
  serviço existente com `school_id` e bloqueios de servidor.
- Mostra cargo, vínculos, tipos de remuneração, faltas e folha salarial
  nas condições existentes; não cria endpoints de escrita.
- Se o professor tenta abrir a ficha de outro, não lhe atribui os próprios
  dados como se fossem do colega.
- Testes puros para nível misto, tipo jurídico e fuso horário.

## Fases de integração ainda necessárias

1. Expor dados completos da pessoa pela ligação `teachers.person_id` e os
   documentos, certificados, habilitações profissionais e contactos de
   emergência, com acesso campo a campo e mascaramento.
2. Criar um endpoint de **meus vencimentos** (self-only), caso a política da
   instituição permita: derivar a pessoa do `auth.uid()` + vínculo activo,
   sem aceitar `teacherId`/ `employmentId` arbitrário do cliente; testes
   de duas escolas e outras contas. Não alargar `requireHrReader`.
3. Filtrar explicitamente horário, turmas, cargas, presenças e resumo pelo
   ano lectivo; distinguir aula prevista, ministrada, cancelada e substituída.
4. Integrar informação real de unidades curriculares, semestre, créditos,
   orientação, investigação, estágio e exame do ensino superior, por relação
   com a cadeira e respectivos papéis.
5. Completar histórico profissional entre anos **da mesma escola**, formação,
   progressão, transferências, férias, licenças e avaliações de desempenho,
   somente quando os serviços e dados existirem.
6. Validar capturas 390/768/1024/1440 px, tema escuro, teclado, foco,
   zoom, estados vazios, erros de servidor e direitos por papel.
7. Executar `tsc`, lint, Vitest, build e E2E em staging multi-tenant. **Não
   publicar em produção sem CI e validação autenticada.**

Nenhum contador de «aulas feitas», «salários pagos» ou «alunos aprovados»
deve ser fabricado a partir de previsões, folhas em rascunho ou matrículas.
