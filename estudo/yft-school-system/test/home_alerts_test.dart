import 'package:flutter_test/flutter_test.dart';
import 'package:yft_school_system/core/sga/sga_work.dart';
import 'package:yft_school_system/features/dashboard/presentation/widgets/home_alerts.dart';

WorkTask task(
  String id,
  WorkState state, {
  DateTime? due,
  double? grade,
  String subject = 'História',
}) => WorkTask(
  id: id,
  title: 'Trabalho $id',
  kind: 'trabalho',
  subjectName: subject,
  state: state,
  dueOn: due,
  grade: grade,
);

AgendaAssessment exam(
  String name,
  DateTime date, {
  String subject = 'Física',
}) => AgendaAssessment(name: name, subjectName: subject, date: date);

void main() {
  final morning = DateTime(2026, 11, 5, 9, 0);
  final evening = DateTime(2026, 11, 5, 19, 0);
  final today = DateTime(2026, 11, 5);
  final tomorrow = DateTime(2026, 11, 6);

  test('o urgente primeiro: atraso, avaliação de hoje, prazo de amanhã', () {
    final alerts = buildHomeAlerts(
      agenda: StudentAgenda(
        upcomingAssessments: [
          exam('Teste 2', today),
          exam('Prova', DateTime(2026, 11, 9), subject: 'Química'),
        ],
      ),
      work: WorkOverview(
        tasks: [
          task('a', WorkState.overdue),
          task('b', WorkState.open, due: tomorrow),
          task('c', WorkState.submitted, due: tomorrow),
        ],
      ),
      now: morning,
    );
    expect(alerts.map((a) => (a.level, a.title)), [
      (AlertLevel.urgent, '«Trabalho a» está em atraso'),
      (AlertLevel.urgent, 'Teste 2 de Física hoje'),
      (AlertLevel.soon, '«Trabalho b» termina amanhã'),
    ]);
    expect(alerts.first.route, '/trabalhos');
    expect(alerts[1].detail, 'Boa sorte!');
  });

  test('ao fim da tarde, o que é para amanhã passa a urgente', () {
    final agenda = StudentAgenda(
      upcomingAssessments: [exam('Teste 1', tomorrow)],
    );
    expect(
      buildHomeAlerts(agenda: agenda, now: morning).single.level,
      AlertLevel.soon,
    );
    final late = buildHomeAlerts(agenda: agenda, now: evening).single;
    expect(late.level, AlertLevel.urgent);
    expect(late.title, 'Teste 1 de Física amanhã');
    expect(late.detail, 'Rever a matéria hoje.');
  });

  test('vários juntam-se; a semana resume as disciplinas', () {
    final alerts = buildHomeAlerts(
      agenda: StudentAgenda(
        upcomingAssessments: [
          exam('T1', DateTime(2026, 11, 8)),
          exam('T2', DateTime(2026, 11, 9), subject: 'Química'),
          exam('T3', DateTime(2026, 11, 10)),
          exam('Antiga', DateTime(2026, 11, 1)),
        ],
      ),
      work: WorkOverview(
        tasks: [task('a', WorkState.overdue), task('b', WorkState.overdue)],
      ),
      now: morning,
    );
    expect(alerts.map((a) => a.title), [
      '2 trabalhos em atraso',
      '3 avaliações nos próximos dias',
    ]);
    expect(alerts.last.detail, 'Física · Química');
  });

  test('notas baixas e média abaixo de 10 levam ao que ajuda', () {
    final alerts = buildHomeAlerts(
      agenda: const StudentAgenda(average: 9.4),
      work: WorkOverview(
        tasks: [
          task('a', WorkState.returned, grade: 8),
          task('b', WorkState.returned, grade: 15),
        ],
      ),
      now: morning,
    );
    expect(alerts.map((a) => (a.title, a.route)), [
      ('Média do ano abaixo de 10 (9.4)', '/result-card'),
      ('Nota 8 em «Trabalho a»', '/trabalhos'),
    ]);
  });

  test('tudo em dia com boa média: uma palavra de incentivo; senão, nada', () {
    final good = buildHomeAlerts(
      agenda: const StudentAgenda(average: 15.2),
      work: WorkOverview(tasks: [task('a', WorkState.returned, grade: 16)]),
      now: morning,
    );
    expect(good.single.level, AlertLevel.good);
    expect(good.single.title, 'Média de 15.2: bom trabalho!');

    expect(
      buildHomeAlerts(agenda: const StudentAgenda(average: 12), now: morning),
      isEmpty,
    );
    expect(buildHomeAlerts(now: morning), isEmpty);
  });

  test('no máximo três, sem perder os urgentes', () {
    final alerts = buildHomeAlerts(
      agenda: StudentAgenda(
        average: 8,
        upcomingAssessments: [exam('T', today), exam('U', tomorrow)],
      ),
      work: WorkOverview(
        tasks: [
          task('a', WorkState.overdue),
          task('b', WorkState.open, due: today),
          task('c', WorkState.returned, grade: 5),
        ],
      ),
      now: evening,
    );
    expect(alerts, hasLength(3));
    expect(alerts.every((a) => a.level == AlertLevel.urgent), isTrue);
  });
}
