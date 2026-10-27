import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:yft_school_system/core/sga/sga_absences.dart';
import 'package:yft_school_system/core/sga/sga_work.dart';
import 'package:yft_school_system/core/theme/app_theme.dart';
import 'package:yft_school_system/features/dashboard/presentation/widgets/home_alerts.dart';
import 'package:yft_school_system/features/reports/presentation/subject_absences_section.dart';

StudentAbsences sample() => StudentAbsences.fromJson({
  'limitPercentage': 25,
  'subjects': [
    {
      'subjectName': 'Física',
      'lessons': 8,
      'absences': 3,
      'percentage': 37.5,
      'remaining': -1,
      'status': 'over',
    },
    {
      'subjectName': 'Inglês',
      'lessons': 10,
      'absences': 2,
      'excused': 1,
      'percentage': 20,
      'remaining': 0,
      'status': 'warning',
    },
    {
      'subjectName': 'Matemática',
      'lessons': 12,
      'absences': 1,
      'percentage': 8.33,
      'remaining': 2,
      'status': 'ok',
    },
  ],
});

void main() {
  test('resposta do portal, risco e texto para a pessoa', () {
    final a = sample();
    expect(a.limitPercentage, 25);
    expect(a.atRisk.map((s) => s.subjectName), ['Física', 'Inglês']);
    expect(formatPercent(37.5), '37,5 %');
    expect(formatPercent(20), '20 %');
    expect(formatPercent(8.33), '8,3 %');
    expect(
      absenceCounts(a.subjects[1]),
      '2 faltas em 10 aulas · 20 % · 1 justificada',
    );
    expect(absenceAdvice(a.subjects[0]), startsWith('Passou o limite'));
    expect(absenceAdvice(a.subjects[1]), 'No limite: mais uma falta passa-o.');
    expect(
      absenceAdvice(a.subjects[2]),
      'Ainda pode faltar a 2 aulas sem passar o limite.',
    );
    expect(
      absenceAdvice(
        const SubjectAbsence(subjectName: 'X', lessons: 1, absences: 0),
      ),
      'A escola não definiu limite de faltas.',
    );
    expect(StudentAbsences.fromJson({}).subjects, isEmpty);
  });

  test('Início: faltas acima do limite são urgentes; perto, aviso', () {
    final alerts = buildHomeAlerts(
      absences: sample(),
      now: DateTime(2026, 11, 5, 9),
    );
    expect(alerts.map((a) => (a.level, a.title, a.route)), [
      (
        AlertLevel.urgent,
        'Faltas a Física acima do limite',
        '/ward-attendance',
      ),
      (AlertLevel.soon, 'Faltas a Inglês perto do limite', '/ward-attendance'),
    ]);
    expect(
      alerts.first.detail,
      '37,5 % de faltas · falar com o director de turma.',
    );
    expect(alerts.last.detail, 'Mais uma falta passa o limite.');
    // Com boa média e faltas em risco, não aparece o «bom trabalho».
    final withAverage = buildHomeAlerts(
      agenda: const StudentAgenda(average: 16),
      absences: sample(),
      now: DateTime(2026, 11, 5, 9),
    );
    expect(withAverage.any((a) => a.level == AlertLevel.good), isFalse);
  });

  testWidgets('lista por disciplina cabe num ecrã estreito', (tester) async {
    tester.view.physicalSize = const Size(320 * 3, 900 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.build(),
        home: Scaffold(
          body: SingleChildScrollView(
            child: SubjectAbsencesList(data: sample()),
          ),
        ),
      ),
    );
    expect(find.text('Física'), findsOneWidget);
    expect(find.text('Acima do limite'), findsOneWidget);
    expect(find.text('Perto do limite'), findsOneWidget);
    expect(find.text('Dentro do limite'), findsOneWidget);
    expect(find.textContaining('Limite da escola: 25 %'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
