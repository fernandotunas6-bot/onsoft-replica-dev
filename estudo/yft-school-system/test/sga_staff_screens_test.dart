import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:yft_school_system/core/models/school_class.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';
import 'package:yft_school_system/core/theme/app_theme.dart';
import 'package:yft_school_system/features/dashboard/presentation/dashboard_screen.dart';
import 'package:yft_school_system/features/profile/presentation/sga_portal_screen.dart';

Future<void> _pump(WidgetTester tester, Widget child) async {
  tester.view.physicalSize = const Size(320 * 3, 900 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  final router = GoRouter(routes: [
    GoRoute(path: '/', builder: (_, _) => Scaffold(body: SingleChildScrollView(child: child))),
  ]);
  await tester.pumpWidget(ProviderScope(
    overrides: [
      currentUidProvider.overrideWithValue('a'),
      classesProvider.overrideWith((ref) async => const [
        SchoolClass(id: 'c1', schoolId: 's', className: '10.ª A'),
        SchoolClass(id: 'c2', schoolId: 's', className: '10.ª B'),
      ]),
    ],
    child: MaterialApp.router(theme: AppTheme.build(), routerConfig: router),
  ));
  await tester.pump(const Duration(milliseconds: 100));
}

void main() {
  testWidgets('Início da direcção no modo SIGA cabe num ecrã estreito', (tester) async {
    await _pump(tester, const SgaAdminDashboard());
    expect(find.text('Turmas do ano lectivo'), findsOneWidget);
    expect(find.text('2'), findsOneWidget);
    expect(find.textContaining('portal do SIGA'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('ecrã do portal do SIGA cabe num ecrã estreito', (tester) async {
    await _pump(tester, const SizedBox(height: 900, child: SgaPortalScreen()));
    expect(find.textContaining('geram-se no portal do SIGA'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
