import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:yft_school_system/core/models/student.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';
import 'package:yft_school_system/core/repositories/grades_repository.dart';
import 'package:yft_school_system/core/theme/app_theme.dart';
import 'package:yft_school_system/features/calendar/application/school_events.dart';
import 'package:yft_school_system/features/reports/presentation/providers/wards_provider.dart';
import 'package:yft_school_system/features/reports/presentation/result_card_screen.dart';

void main() {
  testWidgets('boletim do SIGA na escala 0–20', (tester) async {
    tester.view.physicalSize = const Size(390 * 3, 1400 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    const ward = Student(id: 'st-ana', schoolId: 's', classId: 'cg', name: 'Ana Silva', balance: 0, isActive: true);
    final card = ReportCard('2026/2027', const [
      ReportLine(subjectId: 'f', subjectName: 'Física', classScore: 0, examScore: 0, angola: AngolaScores()),
      ReportLine(
        subjectId: 'm',
        subjectName: 'Matemática',
        classScore: 0,
        examScore: 0,
        angola: AngolaScores(mac: 12.5, npp: 9, npt: 14, mt: 13.3, provisional: true),
      ),
      ReportLine(
        subjectId: 'p',
        subjectName: 'Português',
        classScore: 0,
        examScore: 0,
        angola: AngolaScores(mac: 8, mt: 8),
      ),
    ], scale: 20);

    await tester.pumpWidget(ProviderScope(
      overrides: [
        currentUidProvider.overrideWithValue('p'),
        wardsProvider.overrideWith((ref) async => [ward]),
        academicCalendarProvider.overrideWith((ref) async => null),
        gradeYearsProvider.overrideWith((ref, id) async => (years: ['2026/2027'], current: '2026/2027')),
        reportCardProvider.overrideWith((ref, key) async => card),
      ],
      child: MaterialApp(theme: AppTheme.build(), home: const ResultCardScreen()),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    // Média das disciplinas com nota: (13,3 + 8) / 2 = 10,65 → "10.7" (/20).
    expect(find.text('10.7'), findsOneWidget);
    expect(find.text(' /20'), findsOneWidget);
    expect(find.text('2 disciplinas'), findsOneWidget);
    expect(find.text('MAC 12.5 · NPP 9 · NPT 14 · provisória'), findsOneWidget);
    expect(find.text('MAC — · NPP — · NPT —'), findsOneWidget);
    expect(find.text('—'), findsOneWidget);
    expect(find.textContaining('Escala 0–20'), findsOneWidget);
  });
}
