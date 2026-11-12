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

| Origem | Verdade preservada | Resultado na agenda |
| --- | --- | --- |
| `terms` | Períodos e ano da escola | Intervalos de dia inteiro, com fim exclusivo no DTO |
| `academic_schedules` + `timetable_slots` + `class_subjects` | Horário publicado, docente e disciplina da turma | Ocorrências com data e hora de Luanda |
| `siga_assessment_items` | Avaliações existentes, data, hora e duração | Provas/avaliações sem expor notas |
| `siga_class_tasks` | Tarefas publicadas da disciplina/turma | Prazos de entrega |
| `siga_calendar_events` | Eventos complementares e interrupções aprovadas pela gestão | Reuniões, eventos, prazos e bloqueios de aulas |
| `angola-holidays.ts` | Lista nacional já usada pelo produto, corrigida com 23 de Março | Feriados e exclusão de aulas nesses dias |

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
  events: fullCalendarAcademicSource(
    (range) => listAcademicAgenda({ data: range }),
    { classGroupId },
  ),
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

| Referência consultada | Observação documentada | Aplicação ao SIGA |
| --- | --- | --- |
| [Frappe Education](https://docs.frappe.io/education/course-schedule) e [Student Group](https://docs.frappe.io/education/student-group) | Agenda relaciona curso, docente, grupo e sala; grupos podem representar coorte ou disciplina | Reutilizar turma/disciplina/docente e inscrições, sem duplicar pessoas |
| [openSIS](https://help.opensis.com/portal/en/kb/articles/schedule-students) | Matrículas em secções consideram ano, período, datas e docente | Restringir a agenda pela matrícula e pelo turno da unidade curricular |
| [UniTime](https://help.unitime.org/manuals/courses-solver.html) | Planeamento universitário considera procura discente, salas e disponibilidade docente | Manter validação de conflitos no núcleo; FullCalendar serve a apresentação |
| [FET](https://lalescu.ro/liviu/fet/features.html) | Modela restrições de tempo/espaço para docentes e conjuntos de estudantes | Separar restrições de publicação e visualização; não adoptar um solver neste ciclo |
| [aSc TimeTables](https://help.asctimetables.com/pdf/asc_timetables_en_L4.pdf) | Divisões/subgrupos e cargas de aulas precisam de consistência | Registar como evolução futura; não confundir uma turma inteira com um subgrupo |
| [Untis](https://www.untis.at/en/products/untis-basic-software/calendar-and-full-year-planning-1) | O planeamento anual admite distribuição variável entre semanas | A validade publicada e o calendário são necessários; semanas A/B ficam por desenvolver |
| [Fedena](https://fedena.com/feature-tour/timetable-management-system) | Turnos, atribuição de docentes, substituições e avisos integram o horário | Preservar os mecanismos de RH e notificações existentes; não duplicá-los na agenda |
| [Moodle](https://docs.moodle.org/503/en/Calendar) | Eventos distinguem escola/site, curso, grupo e utilizador, incluindo prazos | Manter origem, âmbito e audiência no backend |
| [MED / Acesso ETP](https://acessoetp.ao/) | O processo público relaciona inscrição, testes, matrícula, turmas e divulgação dos horários | Matrícula antecede o acesso ao horário; sem inferir APIs internas do portal |
| [MESCTI — documentos oficiais](https://mescti.gov.ao/web/documentos?page=2&type=) | Publica o Decreto Executivo 135/26, calendário académico 2026/2027 | Separar referências do superior das do ensino geral; não impor um calendário único |
| [Instituto Superior de Angola](https://isa.ao/ensino/calendario) | Publica semestres, provas de frequência, épocas de exame e pausas próprias | Não fixar três trimestres na agenda de leitura; respeitar os `terms` configurados |

O [calendário do MED publicado em fonte institucional](https://redeeiffel.ao/assets/calendario_2026.pdf)
também evidencia que ensino geral e secundário pedagógico têm organização própria.
É uma referência de **2025/2026**, não autorização para semear datas de 2026/2027.
O feriado de 23 de Março foi confirmado no
[MAPTSS — Lei 11/18](https://www.maptss.gov.ao/wp-content/uploads/2024/10/lei-n-o-11-18-de-28-de-setembro_assembleia-nacional_lex-ao.pdf).

### Estruturas a preservar por nível

Esta é uma síntese de desenho derivada das referências, não uma nova norma legal:

| Estrutura | Como representar no backend |
| --- | --- |
| Iniciação / pré-escolar | Grupo, educador, actividades, intervalos e calendário da instituição; não exigir uma pauta disciplinar do secundário |
| Primário | Turma/coorte e monodocência quando configurada, admitindo docentes especializados |
| Secundário geral | Disciplina por docente, carga semanal, turma, turno, salas e provas |
| Técnico-profissional / magistério | Curso, módulos, aulas práticas/laboratórios e calendários próprios |
| Adultos e modalidades diferenciadas | Estruturas e períodos configuráveis, incluindo regime nocturno; não deduzir regras pela idade |
| Superior | Programa, unidade curricular, semestre, inscrição, turno e época de avaliação; agenda por disciplinas efectivamente inscritas |
| Pós-graduação / formação curta | Coortes e blocos concentrados, com datas próprias; recorrência variável requer evolução adicional |

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
