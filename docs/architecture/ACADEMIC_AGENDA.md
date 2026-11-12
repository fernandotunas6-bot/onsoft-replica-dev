# Agenda académica e horários — backend, 25/10/2026

Implementação apenas de backend. As páginas, as dimensões e o desenho existentes
não foram alterados. A integração entregue ao FullCalendar é a fonte autenticada
de eventos; a biblioteca visual ainda não está instalada nem montada nas páginas.

## Contrato e fontes de dados

`src/features/calendar/agenda-server.ts` disponibiliza:

- `listAcademicAgenda`: leitura por intervalo `[start, end)`, entre 1 e 93 dias.
  Recebe datas civis `AAAA-MM-DD`, ano, turma ou docente opcionais. No portal,
  `studentId` identifica o próprio aluno ou um educando já autorizado pelo servidor.
- `saveAcademicAgendaEvent`: criação e edição de eventos, reuniões, prazos,
  feriados locais e interrupções; Administrador/Secretaria, grants do módulo e MFA.
- `cancelAcademicAgendaEvent`: cancelamento sem apagar o registo. Edição e
  cancelamento exigem `expectedVersion`; uma gravação concorrente é recusada.

| Origem                                                      | Verdade preservada                                              | Resultado na agenda                                 |
| ----------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------- |
| `terms`                                                     | Períodos e ano da escola                                        | Intervalos de dia inteiro, com fim exclusivo no DTO |
| `academic_schedules` + `timetable_slots` + `class_subjects` | Horário publicado, docente e disciplina da turma                | Ocorrências com data e hora de Luanda               |
| `siga_assessment_items`                                     | Avaliações existentes, data, hora e duração                     | Provas/avaliações sem expor notas                   |
| `siga_class_tasks`                                          | Tarefas publicadas da disciplina/turma                          | Prazos de entrega                                   |
| `siga_calendar_events`                                      | Eventos complementares e interrupções aprovadas pela gestão     | Reuniões, eventos, prazos e bloqueios de aulas      |
| `angola-holidays.ts`                                        | Lista nacional já usada pelo produto, corrigida com 23 de Março | Feriados e exclusão de aulas nesses dias            |

Não se copiam aulas para uma tabela de eventos. Não se criam sessões de presença
em GET. A publicação com `syncToCalendar` usa esta mesma agenda para materializar
os próximos 28 dias: respeita validade da versão, períodos, feriados e interrupções,
preserva sessões já existentes e propaga erros da consulta anterior à escrita.

Só são lidas versões `published`, não apagadas, com `valid_from`, compatíveis com
o ano e a turma da disciplina. Os slots sem versão não são tratados como publicados.
O domingo da produção é **7**. Uma interrupção bloqueia apenas o seu ano e,
quando indicados, turma/docente. Reuniões não suspendem aulas automaticamente.

As consultas paginam em lotes de 500, com limite de 20 mil registos por origem e
50 mil eventos por resposta; exceder o limite dá erro explícito, nunca uma agenda
parcial apresentada como completa. Datas inexistentes são recusadas.

## Âmbito e segurança

Todas as consultas de tabelas recebem a escola da sessão, nunca um `schoolId`
fornecido pelo browser. Administrador/Secretaria vêem a escola; o Professor vê as
suas atribuições, com verificação do grant pedagógico. Aluno/Encarregado passam
por `resolveVisibleStudent`, matrículas e intervalos de vigência. No superior,
inscrições `inscrito` em unidades curriculares restringem a disciplina do turno;
uma inscrição anulada não dá acesso. Não se devolvem nomes de outros estudantes,
contactos, notas, tokens de reuniões ou conteúdo de eventos reservados ao pessoal.

Os eventos reservados podem suspender aulas sem divulgar o título ao estudante.
`siga_calendar_events` tem RLS forçada, sem privilégios `anon/authenticated`, FKs
compostas por escola, guarda de datas/ano da turma, controlo de versão e auditoria.

## Ligação ao FullCalendar Standard

O [Standard usa MIT](https://fullcalendar.io/license). As vistas por recursos e
timeline exigem atenção à licença Premium. A integração usa o contrato público de
[eventos por função](https://fullcalendar.io/docs/events-function) e
[Event Object](https://fullcalendar.io/docs/event-object), sem dependência Premium.

```ts
import { listAcademicAgenda } from "@/features/calendar/agenda-server";
import { fullCalendarAcademicSource } from "@/features/calendar/fullcalendar-source";

// Configuração para o consumidor visual futuro, com o transporte SIGA existente.
const options = {
  timeZone: "Africa/Luanda",
  editable: false,
  events: fullCalendarAcademicSource((range) => listAcademicAgenda({ data: range }), {
    classGroupId,
  }),
};
```

O middleware global `attachSupabaseAuth` continua a anexar a sessão. Não usar o
feed ICS público para dados de turmas. Os eventos têm IDs estáveis por origem;
as aulas usam `lesson:<slot>@<data>`. `extendedProps` conserva os IDs de ligação
e, para eventos complementares, `version` e `description`. O adaptador exige
`Africa/Luanda`; o consumidor deve configurar o suporte de fuso da versão do
FullCalendar escolhida. As horas saem com `+01:00`; os fins de dia inteiro são
exclusivos. Arrastar eventos exige uma futura acção de negócio autenticada.

## Pesquisa comparativa: Angola e outros sistemas

Foi feita uma amostra de fontes primárias públicas; não é um inventário de todos
os sistemas existentes no mundo, nem uma auditoria interna de fornecedores.

| Referência consultada                                                                                                                  | Observação documentada                                                                       | Aplicação ao SIGA                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [Frappe Education](https://docs.frappe.io/education/course-schedule) e [Student Group](https://docs.frappe.io/education/student-group) | Agenda relaciona curso, docente, grupo e sala; grupos podem representar coorte ou disciplina | Reutilizar turma/disciplina/docente e inscrições, sem duplicar pessoas                 |
| [openSIS](https://help.opensis.com/portal/en/kb/articles/schedule-students)                                                            | Matrículas em secções consideram ano, período, datas e docente                               | Restringir a agenda pela matrícula e pelo turno da unidade curricular                  |
| [UniTime](https://help.unitime.org/manuals/courses-solver.html)                                                                        | Planeamento universitário considera procura discente, salas e disponibilidade docente        | Manter validação de conflitos no núcleo; FullCalendar serve a apresentação             |
| [FET](https://lalescu.ro/liviu/fet/features.html)                                                                                      | Modela restrições de tempo/espaço para docentes e conjuntos de estudantes                    | Separar restrições de publicação e visualização; não adoptar um solver neste ciclo     |
| [aSc TimeTables](https://help.asctimetables.com/pdf/asc_timetables_en_L4.pdf)                                                          | Divisões/subgrupos e cargas de aulas precisam de consistência                                | Registar como evolução futura; não confundir uma turma inteira com um subgrupo         |
| [Untis](https://www.untis.at/en/products/untis-basic-software/calendar-and-full-year-planning-1)                                       | O planeamento anual admite distribuição variável entre semanas                               | A validade publicada e o calendário são necessários; semanas A/B ficam por desenvolver |
| [Fedena](https://fedena.com/feature-tour/timetable-management-system)                                                                  | Turnos, atribuição de docentes, substituições e avisos integram o horário                    | Preservar os mecanismos de RH e notificações existentes; não duplicá-los na agenda     |
| [Moodle](https://docs.moodle.org/503/en/Calendar)                                                                                      | Eventos distinguem escola/site, curso, grupo e utilizador, incluindo prazos                  | Manter origem, âmbito e audiência no backend                                           |
| [MED / Acesso ETP](https://acessoetp.ao/)                                                                                              | O processo público relaciona inscrição, testes, matrícula, turmas e divulgação dos horários  | Matrícula antecede o acesso ao horário; sem inferir APIs internas do portal            |
| [MESCTI — documentos oficiais](https://mescti.gov.ao/web/documentos?page=2&type=)                                                      | Publica o Decreto Executivo 135/26, calendário académico 2026/2027                           | Separar referências do superior das do ensino geral; não impor um calendário único     |
| [Instituto Superior de Angola](https://isa.ao/ensino/calendario)                                                                       | Publica semestres, provas de frequência, épocas de exame e pausas próprias                   | Não fixar três trimestres na agenda de leitura; respeitar os `terms` configurados      |

O [calendário do MED publicado em fonte institucional](https://redeeiffel.ao/assets/calendario_2026.pdf)
também evidencia que ensino geral e secundário pedagógico têm organização própria.
É uma referência de **2025/2026**, não autorização para semear datas de 2026/2027.
O feriado de 23 de Março foi confirmado no
[MAPTSS — Lei 11/18](https://www.maptss.gov.ao/wp-content/uploads/2024/10/lei-n-o-11-18-de-28-de-setembro_assembleia-nacional_lex-ao.pdf).

### Estruturas a preservar por nível

Esta é uma síntese de desenho derivada das referências, não uma nova norma legal:

| Estrutura                           | Como representar no backend                                                                                                   |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Iniciação / pré-escolar             | Grupo, educador, actividades, intervalos e calendário da instituição; não exigir uma pauta disciplinar do secundário          |
| Primário                            | Turma/coorte e monodocência quando configurada, admitindo docentes especializados                                             |
| Secundário geral                    | Disciplina por docente, carga semanal, turma, turno, salas e provas                                                           |
| Técnico-profissional / magistério   | Curso, módulos, aulas práticas/laboratórios e calendários próprios                                                            |
| Adultos e modalidades diferenciadas | Estruturas e períodos configuráveis, incluindo regime nocturno; não deduzir regras pela idade                                 |
| Superior                            | Programa, unidade curricular, semestre, inscrição, turno e época de avaliação; agenda por disciplinas efectivamente inscritas |
| Pós-graduação / formação curta      | Coortes e blocos concentrados, com datas próprias; recorrência variável requer evolução adicional                             |

## Migrações aplicadas e evidência

Projecto confirmado: **Sga `xodgfmxiaunpamctfeea`**. Nove migrações aplicadas em
25/10/2026 e registadas pelo conector Supabase:

O `apply_migration` ignora o carimbo do ficheiro e gera o seu próprio ao registar —
os 9 ficheiros abaixo foram renomeados para o carimbo real, confirmado em
`supabase_migrations.schema_migrations` (consulta directa, 25/10/2026):

1. `20261025070201_teacher_number_and_merge_people.sql` — numeração docente acima
   do maior número existente e fusão transaccional de pessoas, só servidor.
2. `20261025070203_saas_audit_logs_server_only.sql`.
3. `20261025070206_access_cards_one_active_per_person.sql`.
4. `20261025070209_enrollment_public_server_only.sql`.
5. `20261025070212_lesson_meetings_server_only.sql`.
6. `20261025070215_academic_agenda_backend.sql`.
7. `20261025070218_reconcile_teacher_and_early_enrollment.sql` — matrícula no ano
   activo/em preparação, até 183 dias antes, gravada a partir do início do ano,
   preservando a numeração numérica `next_year_number`.
8. `20261025070713_capture_existing_cash_tables.sql` — captura do DDL de duas
   tabelas já presentes na produção, detectadas ao recapturar; RLS forçada e
   acesso só pelo servidor. Nenhum fluxo financeiro foi criado neste trabalho.
9. `20261025071525_preserve_long_teacher_numbers.sql` — o ensaio funcional
   revelou que `lpad(text, 6)` corta identificadores maiores. A formatação passa
   a preservar todos os dígitos, mantendo o lock e a sequência; os números
   anteriormente atribuídos não são alterados.

A migração antiga `20261010130000_early_enrollment.sql` **não foi reaplicada**:
reporia `MAT-…` e conflitaria com o CHECK da numeração numérica já em produção.
Também não foram repetidos os pacotes base antigos nem migrações Lovable. Há
ficheiros históricos consolidados/aplicados com outros carimbos no livro da base;
os nomes de ficheiro, isoladamente, não provam pendência. As nove acima são o
pacote executado, não uma alegação de replay integral de todo o histórico.

O pacote inicial foi ensaiado duas vezes numa única transacção revertida antes
da aplicação. O teste permanente `supabase/tests/academic_agenda_security_test.sql`
voltou a verificar privilégios, RLS, versões, datas e numeração depois da aplicação,
também com `ROLLBACK`. O ensaio funcional inclui cadastro docente com sequência
superior a seis dígitos e matrícula num ano em preparação, com confirmação da data
gravada, numeração numérica, recusa aos 184 dias e recusa sem MFA.
Contagens antes/depois: 42 alunos, 4 docentes, 43 matrículas,
233 turmas. Os tipos foram gerados por `siga:gen-types` no caminho canónico
`types.sga.ts`, e `siga:db-snapshot` recapturou as **210 tabelas**, todas com RLS.
`SIGA_SUPABASE_CLI` permite usar o CLI já instalado nesses scripts sem descarregar
outra cópia através de `npx`.

### Limites verificados

- Esta entrega disponibiliza o backend e o adaptador Standard; não publica uma
  interface FullCalendar nem altera o feed ICS público.
- Não implementa solver automático, semanas A/B, subgrupos simultâneos, estágios
  externos ou adaptação legal automática a cada país. Os catálogos existentes
  continuam a definir níveis/cursos; a agenda lê períodos sem fixar três trimestres.
- Pontes, tolerâncias, pausas e feriados locais precisam de registo escolar
  confirmado. Não foram inventadas datas oficiais para escolas reais.
- Alterar uma interrupção não apaga sessões de presença nem provas já registadas.
  A reconciliação retrospectiva permanece uma operação própria, com auditoria.
- O verificador Supabase mantém avisos anteriores: 18 funções SECURITY DEFINER
  executáveis por utilizadores autenticados e protecção de senhas comprometidas
  desactivada. O aumento de tabelas sem políticas inclui tabelas intencionalmente
  só do servidor; não se abriram políticas para silenciar o aviso informativo.
  [Referência do verificador](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

Os testes e a compilação deste ciclo estão registados no handoff
[`docs/agents/CONTINUE.md`](../agents/CONTINUE.md) e na
[evidência de execução](academic-agenda-evidence-2026-10-25.json).

## Continuação: publicação atómica e consulta diária — 25/10/2026

A consulta existente `listDayAgendaLessons` passa a consumir a mesma agenda
publicada, mantendo os IDs de slot, nomes e horas exigidos pelos consumidores.
Os filtros de docente e os períodos/feriados são resolvidos antes do limite da
lista. Administrador, Secretaria, Professor e Tesouraria mantêm a consulta de
aulas do dia com a guarda do módulo; a edição continua reservada à gestão. Não
foram alterados componentes, dimensões ou navegação.

`publishAcademicSchedule` exige MFA e chama agora um único RPC:
`publish_academic_schedule_atomic`. Valida escola, turma, ano, períodos lectivos,
datas, docentes activos, carga semanal e conflitos; arquiva a versão anterior,
cria a nova, associa as aulas e regista a publicação na mesma transacção. A versão
guarda um snapshot das aulas e atribuições. Uma falha posterior ao arquivo faz
rollback de todo esse núcleo. As trancas reutilizam as chaves escola/dia dos
RPCs existentes, começando pela chave 7 usada na aplicação em lote. A razão é
a [coordenação transaccional do PostgreSQL](https://www.postgresql.org/docs/17/explicit-locking.html).

A migração adicional
`20261025121012_atomic_academic_schedule_publication.sql` está aplicada no SGA;
o ficheiro tem o carimbo efectivamente registado na base. A função é SECURITY
INVOKER e só `service_role` a executa. O servidor verifica papel, grants, escola e
MFA antes da chamada. Não se abriram privilégios para o browser nem se aumentou
o limite do teste que controla o uso de clientes privilegiados; a necessidade do
RPC reservado foi documentada na lista de desenho desse teste.

Presenças e notificações correm **depois** do commit da publicação. Se as
presenças falharem, a mensagem informa que o horário já foi publicado. A nova
operação `syncPublishedAcademicSchedule` repete essa sincronização, com escola,
turma, ano e MFA verificados, sem gerar outra versão. Só se repetem automaticamente
erros SQL que garantem rollback (`40P01`/`40001`), nunca falhas de rede cujo commit
seja incerto.

O ensaio SQL permanente
`supabase/tests/academic_schedule_publication_test.sql` verificou V1/V2, snapshot,
arquivo, carga e validade, provocando uma falha ao associar as aulas. Correu
também com a role `service_role` usada pelo servidor. Todas as pessoas, turmas,
versões e auditorias de ensaio foram revertidas; as contagens da escola mantêm-se.
O ficheiro de migração foi ensaiado duas vezes na mesma transacção antes de ser
aplicado. Não se executou um ensaio de escrita concorrente com duas sessões.

O build, TypeScript, ESLint e verificações deste complemento estão na
[evidência da continuação](academic-schedule-publication-evidence-2026-10-25.json).
O código da aplicação está no workspace; esta continuação não fez deploy.

## Refinamento: portais e ressincronização de presenças — 25/10/2026

As APIs existentes do aluno, encarregado e horário do docente deixam de consultar
directamente a repetição de `timetable_slots`. Consomem a agenda autorizada e as
projecções de `calendar/portal-agenda.ts`, preservando os campos usados pelos
componentes. A próxima aula corresponde a uma data real nos próximos 93 dias;
uma pausa lectiva não é convertida artificialmente numa aula na semana seguinte.
As avaliações terminadas com hora/duração são excluídas, incluindo quando o fim
vem em UTC; avaliações do dia sem hora permanecem visíveis. O limite de oito
aplica-se depois dessa filtragem.

O horário semanal corresponde à semana civil corrente de Luanda, de segunda
inclusiva a segunda exclusiva. Domingo da base (7) é normalizado para o contrato
do portal (0), sem perder a aula. Identificadores de slot, turma, disciplina,
docente, sala e publicação acompanham a ocorrência. `room_id` resolve a sala
actual dentro da escola, com o texto do slot como alternativa quando não existir.
Se não houver ocorrências, devolve-se a lista vazia; não há fallback para rascunhos.
O componente existente continua a usar a sua mensagem genérica de horário vazio;
não foi redesenhado neste trabalho de backend.

A turma/média do cabeçalho usa uma matrícula activa cuja data de entrada já
chegou e cuja data de fim não passou, evitando que a pré-matrícula do próximo ano
substitua a actual. A agenda continua a funcionar para unidades curriculares sem
matrícula ordinária de turma. Quando essa matrícula existe, a inscrição na cadeira
respeita os seus períodos de acesso e não reabre matrículas canceladas nem
encerradas sem data final. Consideram-se todos os períodos válidos da turma,
em vez da primeira matrícula encontrada. Um `studentId` explícito obriga a
resolver o próprio aluno/educando; acumular um papel de funcionário não transforma
esse pedido numa consulta da escola inteira.

Os detalhes da aula seguem a mesma autorização. Para aluno/encarregado,
`getLessonDetail` exige uma ocorrência do slot na agenda autorizada, desde o
início da semana corrente e numa janela de 93 dias. Isto permite abrir a cadeira
inscrita sem matrícula ordinária e recusa um ID directo de outra disciplina ou
de um slot sem publicação válida. Nomes, contactos e outros lookups são filtrados
pela escola. No pedido explícito de educando, um papel administrativo adicional
não activa edição nem a visibilidade de contactos reservada ao pessoal.

A sincronização de presenças passou da leitura seguida de INSERT para
[`upsert` com `onConflict`, `ignoreDuplicates` e contagem exacta](https://supabase.com/docs/reference/javascript/upsert).
Confirmou-se no catálogo de produção que o índice único
`siga_attendance_sessions_school_slot_day_key` cobre exactamente escola, slot e
data. A base arbitra conflitos sem actualizar sessões existentes. Os lotes têm
até 500 linhas; cada lote conta apenas as sessões inseridas. Uma falha posterior
a um lote não desfaz os anteriores: a operação informa a falha e uma repetição
ignora os já gravados. Não se faz retry automático de falhas de rede incertas.

O ensaio SQL permanente confirmou uma inserção, zero inserções no conflito e a
preservação do ID, estado concluído e hora original. Correu como `service_role`
e foi integralmente revertido. As contagens de produção mantiveram-se em 42
alunos, 4 docentes, 43 matrículas, 233 turmas e 192 sessões. A concorrência foi
testada no serviço com pedidos simultâneos simulados e a arbitragem do índice foi
verificada em SQL; não se executou um ensaio com duas ligações de escrita reais.

Este refinamento não acrescenta DDL, dependências ou interface FullCalendar.
Usa as migrações já aplicadas. Verificações na
[evidência do refinamento](academic-portal-refinement-evidence-2026-10-25.json).
