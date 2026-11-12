# Trabalhos com entrega e renovação de matrícula, por nível de ensino

**Data:** 25/10/2026. **Estado:** proposto. Nada desta SPEC está implementado, salvo onde se diz «implementado». Antes de qualquer migração, ler [DATABASE_RULES.md](../agents/DATABASE_RULES.md): o Lovable aplica na base de produção.

Convenção do [README](README.md): **implementado** é código presente; **proposto** não tem prova de aceitação; **por decidir** exige regra da instituição ou do Ministério.

## 1. Níveis de ensino a servir

O sistema de ensino angolano rege-se pela Lei n.º 17/16 (Bases do Sistema de Educação e Ensino), alterada pela Lei n.º 32/20, que fechou o ensino secundário como nível terminal, acabou com a monodocência na 5.ª e 6.ª classes e com o bacharelato, e criou o ensino superior binário (universitário e politécnico). O Decreto Presidencial n.º 162/23 aprova o regime jurídico do ensino primário e secundário do ensino geral.

| Nível                                  | Classes / anos         | O que muda para trabalhos e matrículas                                                                                                   |
| -------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Primário                               | 1.ª–6.ª                | Professor titular até à 4.ª; desde a Lei 32/20, sem monodocência na 5.ª e 6.ª. Trabalhos de casa curtos; quem acompanha é o encarregado. |
| Secundário geral, I ciclo              | 7.ª–9.ª                | Um professor por disciplina. Trabalhos individuais e de grupo entram na avaliação contínua.                                              |
| Secundário geral, II ciclo             | 10.ª–12.ª              | Por área (ex.: Ciências Físicas e Biológicas, Económicas e Jurídicas). Trabalhos de pesquisa e projectos.                                |
| Técnico-profissional                   | 10.ª–13.ª              | Disciplinas técnicas e práticas (ex.: «Projecto Tecnológico», já no catálogo), oficina e estágio. Entregas de projecto por fases.        |
| Superior (universitário e politécnico) | licenciatura, mestrado | Trabalhos práticos, relatórios, trabalho de fim de curso; prazos rígidos e verificação de originalidade.                                 |

**Por decidir:** o regulamento de avaliação em vigor para o ensino geral. O Decreto Executivo n.º 424/25 aparece como revogado na base legal consultada, sem o substituto identificado. Até haver texto confirmado, o peso dos trabalhos na nota é **configuração da escola**, nunca uma regra fixa no código.

## 2. Trabalhos com entrega

### Implementado

- `siga_class_tasks`: tarefa por disciplina da turma (`class_subject_id`), com tipo (`tpc`, `trabalho`, `pesquisa`, `projecto`, `leitura`, `outra`), título, descrição, data de entrega e estado (`published`, `archived`). O professor publica a partir do detalhe da aula (`src/features/academic/timetable-lessons.ts`), e a agenda mostra-as.
- Ligações externas por capacidade instalada: `classroom.work`, `canvas.assignments`, `moodle.grades` e `turnitin.originality`.

### Lacuna

Não há **entrega**: o aluno não submete, o professor não recebe nem devolve, e uma tarefa nunca chega à pauta. Não existe tabela de entregas no retrato da produção.

### Proposto

Comportamento comum aos sistemas de referência (Google Classroom, Moodle, Canvas), adaptado:

1. **Prazo e atraso.** Uma entrega depois de `due_on` fica marcada «entregue com atraso», com o tempo de atraso visível. A tarefa pode recusar entregas atrasadas (opção por tarefa).
2. **Reenvio.** O aluno pode substituir a entrega até o professor a devolver. Guarda-se o histórico das tentativas; nada se apaga.
3. **Nota provisória e devolução.** O professor escreve nota e comentário em rascunho; só ao **devolver** o aluno os vê. Devolver não é o mesmo que lançar na pauta.
4. **Ligação à pauta, opcional.** «Conta para a avaliação» cria ou usa uma avaliação (`siga_assessment_items`) da mesma turma e disciplina. Os triggers `enforce_teacher_assessment_*_scope` já garantem que só o professor da turma o faz.
5. **Por nível:**
   - Primário: o encarregado vê a tarefa e o estado da entrega, e pode marcar «visto». A entrega pode ser em papel: o professor regista «entregue» sem ficheiro.
   - Secundário: entrega individual ou de **grupo**, com um ficheiro por grupo e a mesma nota para todos, editável por aluno.
   - Técnico-profissional: tarefa com **fases** (proposta, intermédia, final), cada uma com o seu prazo.
   - Superior: prazo com hora (não só o dia), originalidade por `turnitin.originality` quando instalado, e anonimato opcional na correcção.

**Modelo de dados proposto** (a confirmar contra o retrato antes de escrever SQL):

`siga_class_task_submissions`: `id`, `school_id`, `task_id → siga_class_tasks`, `enrollment_id → enrollments`, `group_key` (opcional), `attempt` (≥ 1), `status` (`draft`, `submitted`, `returned`), `submitted_at`, `body` (texto ≤ 4000), `file_id → arquivos da escola` (opcional), `grade` (numérico, na escala do modelo), `feedback`, `graded_by`, `returned_at`, `created_by`, `updated_by`, `created_at`, `updated_at`. Único por (`task_id`, `enrollment_id`, `attempt`).

Na mesma migração, segundo as [regras da base](../agents/DATABASE_RULES.md):

- `FORCE ROW LEVEL SECURITY` e `REVOKE ALL … FROM PUBLIC, anon, authenticated`. Contém trabalhos de menores, por isso **não** usar `is_school_member`, que inclui alunos e encarregados.
- Trigger `siga_touch_updated_at()`.
- SQL idempotente, provado em PGlite (`tests/sql/*.mjs`) antes de aplicar.

**Regras no servidor:**

- O aluno só entrega na sua própria matrícula activa, numa tarefa publicada da sua turma.
- O professor só vê e avalia entregas das turmas e disciplinas que lecciona.
- A direcção e a secretaria lêem tudo.
- Uma tarefa arquivada não aceita entregas.

**Aceitação:** ensaio por nível com dados sintéticos — publicar, entregar com atraso, reenviar, devolver e ligar à pauta — mais um teste de que o aluno A não lê a entrega do aluno B.

## 3. Matrículas

### Implementado

- «Nova matrícula» (`StudentEnrollmentSheet`): 5 passos, com verificação de duplicados no fim (`findPersonDuplicates`).
- Matricular ou mudar de turma um aluno existente: `enrollStudentInClass`, na ficha do aluno e em lote («Atribuir turma», `batchAssignClass`).
- Resultado final por turma (transita / não transita): `getClassFinalResults` e `recordClassFinalResults`.
- **PR #328:** a «Nova matrícula» mostra, enquanto se escreve, os alunos da escola com o mesmo BI/NIF, telefone ou nome, e matricula o existente sem criar outro.

### Lacunas

1. **Renovação de matrícula (passagem de ano).** O resultado final fica gravado, mas nada o usa para matricular os alunos que transitam na classe seguinte do novo ano. Hoje faz-se aluno a aluno, ou turma a turma com «Atribuir turma».
2. **`searchStudents` com `query`** filtra depois de paginar: com `limit: 25` procura só entre os 25 primeiros alunos por número. Nenhum ecrã passa `query` hoje (todos lêem até 1000 e filtram no navegador), por isso o defeito está adormecido. Com mais de 1000 alunos, a lista da página /alunos fica também incompleta.

### Proposto: renovação de matrícula

1. A secretaria escolhe a turma de origem (ano que fecha) e a turma de destino (novo ano).
2. A lista vem do resultado final gravado:
   - transita → classe seguinte;
   - não transita → mesma classe, só se a escola permitir a repetência nessa classe;
   - concluiu → fim de ciclo (sem nova matrícula; estado «Concluído»);
   - sem resultado → fica de fora, com o motivo à vista.
3. Cada aluno pode ser desmarcado antes de confirmar. A gravação é idempotente: repetir não cria uma segunda matrícula, como o `requestId` da matrícula nova.
4. Regras que já existem e se mantêm: a lotação da turma é da base (`enroll_student`); com dívida, a escola decide se bloqueia (configuração financeira, **por decidir**); a matrícula exige 2FA.
5. No superior, a renovação é por **inscrição em unidades curriculares**, não por turma (ver [higher-ed](modules/higher-ed.md)): a lista vem das unidades em atraso e do ano curricular seguinte.

**Aceitação:** renovar uma turma sintética de 20 alunos com 3 resultados diferentes; repetir a operação sem duplicar; recusar acima da lotação.

## Fontes

- [Lei n.º 32/20, de 12 de Agosto (lex.ao)](https://lex.ao/docs/assembleia-nacional/2020/lei-n-o-32-20-de-12-de-agosto/), que altera a [Lei n.º 17/16, de 7 de Outubro](https://lex.ao/docs/assembleia-nacional/2016/lei-n-o-17-16-de-07-de-outubro/).
- [Decreto Presidencial n.º 162/23, de 1 de Agosto](https://lex.ao/docs/presidente-da-republica/2023/decreto-presidencial-n-o-162-23-de-01-de-agosto/): regime jurídico do ensino primário e secundário do ensino geral.
- [Decreto Executivo n.º 276/20](https://lex.ao/docs/ministerio-da-educacao/2020/decreto-executivo-n-o-276-20-de-24-de-novembro/): orientações de avaliação para o ano lectivo de 2020 (histórico).
- Google Classroom, [notas e devolução](https://developers.google.com/workspace/classroom/guides/key-concepts/grades); Moodle, [entregas atrasadas](https://city-uk-ett.libguides.com/staff/moodle/assignment-feedback/late-submissions); Canvas, [reenvio contado como atraso](https://community.canvaslms.com/t5/Canvas-Question-Forum/Re-submission-considered-as-late-submission/m-p/516850).
