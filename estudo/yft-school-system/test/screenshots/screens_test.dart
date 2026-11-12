// Capturas dos ecrãs principais, com dados de exemplo, para rever o visual sem
// telemóvel. Só correm no modo SIGA e a gravar as imagens:
//
//   flutter test test/screenshots --update-goldens \
//     --dart-define=SGA_SUPABASE_URL=https://sga.test \
//     --dart-define=SGA_SUPABASE_PUBLISHABLE_KEY=sb_publishable_test
//
// As imagens ficam em test/screenshots/goldens/ (fora do Git); o workflow
// «Estudo — YFT (APK Android)» anexa-as a cada PR. Não comparam nada: servem
// para olhar.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:yft_school_system/core/auth/auth_state.dart';
import 'package:yft_school_system/core/models/school_notice.dart';
import 'package:yft_school_system/core/models/student.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';
import 'package:yft_school_system/core/repositories/attendance_repository.dart';
import 'package:yft_school_system/core/sga/sga_absences.dart';
import 'package:yft_school_system/core/sga/sga_config.dart';
import 'package:yft_school_system/core/sga/sga_notifications.dart';
import 'package:yft_school_system/core/sga/sga_work.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/theme/app_theme.dart';
import 'package:yft_school_system/features/calendar/application/school_events.dart';
import 'package:yft_school_system/features/dashboard/presentation/dashboard_screen.dart';
import 'package:yft_school_system/features/dashboard/presentation/providers/notices_providers.dart';
import 'package:yft_school_system/features/notifications/presentation/notifications_screen.dart';
import 'package:yft_school_system/features/reports/presentation/providers/wards_provider.dart';
import 'package:yft_school_system/features/reports/presentation/ward_attendance_screen.dart';
import 'package:yft_school_system/features/work/presentation/submit_work_screen.dart';
import 'package:yft_school_system/features/work/presentation/work_screen.dart';

class _Parent extends AuthStateNotifier {
  @override
  AppSession? build() => AppSession(
    role: UserRole.parent,
    userName: 'Ana Costa',
    schoolId: 's',
    uid: 'u1',
    schoolName: 'Colégio Exemplo',
  );
}

final _now = DateTime.now();
DateTime _days(int n) => DateTime(_now.year, _now.month, _now.day + n);
String _iso(DateTime d) =>
    '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

final _ward = Student.fromJson({
  'id': 'w1',
  'school_id': 's',
  'class_id': 'c1',
  'name': 'Rui Costa',
  'class_name': '10.ª A',
});

final _agenda = StudentAgenda.fromJson({
  'className': '10.ª A',
  'average': 13.6,
  'nextLesson': {
    'subjectName': 'Matemática',
    'startsAt': '07:30',
    'endsAt': '08:15',
    'daysAhead': 1,
  },
  'upcomingAssessments': [
    {'name': 'Teste 2', 'subjectName': 'Física', 'date': _iso(_days(1))},
    {'name': 'Prova', 'subjectName': 'Química', 'date': _iso(_days(5))},
  ],
});

final _work = WorkOverview.fromJson({
  'canSubmit': false,
  'summary': {'average': 14},
  'tasks': [
    {
      'id': 't1',
      'title': 'Resumo do capítulo 3',
      'subjectName': 'História',
      'state': 'overdue',
      'dueOn': _iso(_days(-2)),
    },
    {
      'id': 't2',
      'title': 'Ficha de exercícios',
      'subjectName': 'Matemática',
      'state': 'open',
      'dueOn': _iso(_days(1)),
    },
    {
      'id': 't3',
      'title': 'Relatório de laboratório',
      'subjectName': 'Física',
      'state': 'returned',
      'latest': {'grade': 16, 'feedback': 'Bom trabalho.'},
    },
  ],
});

final _absences = StudentAbsences.fromJson({
  'limitPercentage': 25,
  'subjects': [
    {
      'subjectName': 'Inglês',
      'lessons': 20,
      'absences': 4,
      'percentage': 20,
      'remaining': 1,
      'status': 'warning',
    },
    {
      'subjectName': 'Matemática',
      'lessons': 24,
      'absences': 1,
      'percentage': 4.17,
      'remaining': 5,
      'status': 'ok',
    },
    {
      'subjectName': 'Física',
      'lessons': 18,
      'absences': 0,
      'excused': 1,
      'percentage': 0,
      'remaining': 4,
      'status': 'ok',
    },
  ],
});

final _feed = NoticeFeed(
  unread: 2,
  items: [
    PersonalNotice(
      id: 'n1',
      title: 'Trabalho devolvido: Relatório de laboratório',
      body: '16 valores. Bom trabalho.',
      eventType: 'academic.task.returned',
      read: false,
      createdAt: _now.subtract(const Duration(minutes: 12)),
    ),
    PersonalNotice(
      id: 'n2',
      title: 'Avaliação marcada: Física',
      body: 'Teste 2 — amanhã.',
      eventType: 'academic.assessment.scheduled',
      read: false,
      createdAt: _now.subtract(const Duration(hours: 3)),
    ),
    PersonalNotice(
      id: 'n3',
      title: 'Pauta do 1.º trimestre publicada',
      body: 'Já pode ver as notas no boletim.',
      eventType: 'academic.grade_sheet.published',
      read: true,
      createdAt: _now.subtract(const Duration(days: 1, hours: 2)),
    ),
  ],
);

final _notices = [
  SchoolNotice(
    id: 'a1',
    schoolId: 's',
    title: 'Reunião de encarregados de educação',
    summary: 'Sábado às 9h, no salão.',
    body: 'Sábado às 9h, no salão.',
    category: 'general',
    createdAt: _now.subtract(const Duration(days: 3)).toIso8601String(),
    isRead: false,
    audience: 'all_guardians',
  ),
];

List<Override> get _overrides => [
  authProvider.overrideWith(_Parent.new),
  currentUidProvider.overrideWithValue('u1'),
  wardsProvider.overrideWith((ref) async => [_ward]),
  studentAgendaProvider.overrideWith((ref, _) async => _agenda),
  workOverviewProvider.overrideWith((ref, _) async => _work),
  subjectAbsencesProvider.overrideWith((ref, _) async => _absences),
  personalNoticesProvider.overrideWith((ref) async => _feed),
  parentNoticesProvider.overrideWith((ref) async => _notices),
  unreadNoticesCountProvider.overrideWith((ref) async => 0),
  conversationsUnreadProvider.overrideWith((ref) async => 2),
  subjectsProvider.overrideWith((ref, _) async => const []),
  myTimetableProvider.overrideWith((ref) async => const []),
  timetableProvider.overrideWith((ref, _) async => const []),
  schoolEventsProvider.overrideWith((ref) async => const []),
  academicCalendarProvider.overrideWith((ref) async => null),
  studentAttendanceProvider.overrideWith(
    (ref, _) async =>
        const StudentAttendance(58, 5, ['2026-10-20', '2026-10-14']),
  ),
];

Future<void> _loadFonts() async {
  GoogleFonts.config.allowRuntimeFetching = false;
  Future<void> load(String family, List<String> assets) async {
    final loader = FontLoader(family);
    for (final a in assets) {
      loader.addFont(rootBundle.load(a));
    }
    await loader.load();
  }

  await load('packages/lucide_icons/Lucide', [
    'packages/lucide_icons/assets/lucide.ttf',
  ]);
  await load('MaterialIcons', ['fonts/MaterialIcons-Regular.otf']);
}

Future<void> _shot(
  WidgetTester tester,
  String name,
  Widget screen, {
  required bool dark,
}) async {
  tester.view.physicalSize = const Size(390 * 2, 844 * 2);
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.reset);
  AppColors.apply(accent: AppColors.accents.first.color, dark: dark);
  addTearDown(
    () => AppColors.apply(accent: AppColors.accents.first.color, dark: false),
  );
  final router = GoRouter(
    routes: [GoRoute(path: '/', builder: (_, _) => screen)],
  );
  await tester.pumpWidget(
    ProviderScope(
      overrides: _overrides,
      child: MaterialApp.router(
        debugShowCheckedModeBanner: false,
        theme: AppTheme.build(reduceMotion: true),
        routerConfig: router,
      ),
    ),
  );
  await tester.runAsync(() => GoogleFonts.pendingFonts());
  for (var i = 0; i < 5; i++) {
    await tester.pump(const Duration(milliseconds: 200));
  }
  await expectLater(
    find.byType(MaterialApp),
    matchesGoldenFile('goldens/$name-${dark ? 'escuro' : 'claro'}.png'),
  );
}

void main() {
  setUpAll(_loadFonts);

  final screens = <String, Widget Function()>{
    'inicio-encarregado': () => const DashboardScreen(),
    'notificacoes': () => const NotificationsScreen(enabled: true),
    'faltas': () => const WardAttendanceScreen(initialWardId: 'w1'),
    'trabalhos': () => const WorkScreen(),
    'entregar': () => SubmitWorkScreen(task: _work.tasks.first),
  };

  for (final dark in [false, true]) {
    for (final entry in screens.entries) {
      testWidgets(
        '${entry.key} (${dark ? 'escuro' : 'claro'})',
        (tester) => _shot(tester, entry.key, entry.value(), dark: dark),
        skip: !sgaMode,
      );
    }
  }
}
