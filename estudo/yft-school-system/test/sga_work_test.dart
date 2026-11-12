import 'package:flutter_test/flutter_test.dart';
import 'package:yft_school_system/core/sga/sga_work.dart';
import 'package:yft_school_system/features/work/presentation/work_widgets.dart';

void main() {
  test('agenda do portal: média, turma, próxima aula e avaliações', () {
    final agenda = StudentAgenda.fromJson({
      'className': '10.ª A',
      'average': 13.4,
      'nextLesson': {
        'weekday': 2,
        'startsAt': '07:30:00',
        'endsAt': '08:15:00',
        'subjectName': 'Matemática',
        'daysAhead': 1,
      },
      'nextAssessment': {'name': 'Teste 1', 'subjectName': 'Física', 'date': '2026-11-10', 'kind': 'teste'},
      'upcomingAssessments': [
        {'name': 'Teste 1', 'subjectName': 'Física', 'date': '2026-11-10', 'kind': 'teste'},
      ],
    });
    expect(agenda.className, '10.ª A');
    expect(agenda.average, 13.4);
    expect(agenda.nextLesson!.startsAt, '07:30');
    expect(agenda.nextAssessment!.subjectName, 'Física');
    expect(StudentAgenda.fromJson({}).nextAssessment, isNull);
  });

  test('trabalhos do portal: estado, nota só depois de devolvido, por fazer', () {
    final work = WorkOverview.fromJson({
      'canSubmit': true,
      'summary': {'total': 3, 'average': 15},
      'tasks': [
        {'id': 'a', 'title': 'Resumo', 'kind': 'trabalho', 'subjectName': 'História', 'dueOn': '2026-11-01', 'state': 'overdue', 'latest': null},
        {'id': 'b', 'title': 'Ficha', 'kind': 'exercicios', 'subjectName': 'Matemática', 'dueOn': null, 'state': 'open', 'latest': null},
        {
          'id': 'c', 'title': 'Teste', 'kind': 'teste', 'subjectName': 'Física', 'state': 'returned', 'countsForPauta': true,
          'latest': {'grade': 15, 'feedback': 'Bom', 'submittedAt': '2026-10-30T10:00:00Z', 'isLate': true, 'onPaper': false},
        },
      ],
    });
    expect(work.canSubmit, isTrue);
    expect(work.average, 15);
    expect(work.pending.map((t) => t.id), ['a', 'b']);
    final c = work.tasks.last;
    expect((c.state, c.grade, c.feedback, c.late, c.countsForPauta), (WorkState.returned, 15.0, 'Bom', true, true));
    expect(WorkTask.fromJson({'id': 'x', 'state': 'algo-novo'}).state, WorkState.missed);
  });

  test('prazo relativo', () {
    final now = DateTime(2026, 11, 5, 10);
    expect(relativeDay(null, now: now), 'Sem prazo');
    expect(relativeDay(DateTime(2026, 11, 5), now: now), 'Hoje');
    expect(relativeDay(DateTime(2026, 11, 6), now: now), 'Amanhã');
    expect(relativeDay(DateTime(2026, 11, 4), now: now), 'Ontem');
    expect(relativeDay(DateTime(2026, 11, 8), now: now), 'Em 3 dias');
    expect(relativeDay(DateTime(2026, 11, 1), now: now), 'Há 4 dias');
    expect(relativeDay(DateTime(2026, 12, 25), now: now), '25/12');
    expect(formatGrade(15), '15');
    expect(formatGrade(13.4), '13.4');
  });
}
