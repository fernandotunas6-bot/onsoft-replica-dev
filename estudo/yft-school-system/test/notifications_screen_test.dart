import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:yft_school_system/core/auth/auth_state.dart';
import 'package:yft_school_system/core/models/school_notice.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';
import 'package:yft_school_system/core/sga/sga_notifications.dart';
import 'package:yft_school_system/core/theme/app_theme.dart';
import 'package:yft_school_system/features/dashboard/presentation/providers/notices_providers.dart';
import 'package:yft_school_system/features/notifications/presentation/notifications_screen.dart';

class _Parent extends AuthStateNotifier {
  @override
  AppSession? build() => AppSession(
    role: UserRole.parent,
    userName: 'Ana',
    schoolId: 's',
    uid: 'u1',
  );
}

void main() {
  testWidgets('centro de notificações: por dia, por ler e num ecrã estreito', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320 * 3, 900 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);

    final now = DateTime.now();
    final feed = NoticeFeed(
      items: [
        PersonalNotice(
          id: 'n1',
          title: 'Trabalho devolvido: Resumo de História',
          body: '15 valores. Bom trabalho, faltou a conclusão.',
          eventType: 'academic.task.returned',
          read: false,
          createdAt: now.subtract(const Duration(minutes: 3)),
        ),
        PersonalNotice(
          id: 'n2',
          title: 'Avaliação marcada: Física',
          body: 'Teste 2 — 10/11.',
          eventType: 'academic.assessment.scheduled',
          read: true,
          createdAt: now.subtract(const Duration(days: 1)),
        ),
      ],
      unread: 1,
    );
    final notices = [
      SchoolNotice(
        id: 'c1',
        schoolId: 's',
        title: 'Reunião de encarregados',
        summary: 'Sábado às 9h.',
        body: 'Sábado às 9h, no salão.',
        category: 'general',
        createdAt: now.subtract(const Duration(days: 10)).toIso8601String(),
        isRead: false,
        audience: 'all_guardians',
      ),
    ];

    final router = GoRouter(
      routes: [
        GoRoute(
          path: '/',
          builder: (_, _) => const NotificationsScreen(enabled: true),
        ),
      ],
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authProvider.overrideWith(_Parent.new),
          currentUidProvider.overrideWithValue('u1'),
          personalNoticesProvider.overrideWith((ref) async => feed),
          parentNoticesProvider.overrideWith((ref) async => notices),
        ],
        child: MaterialApp.router(
          theme: AppTheme.build(),
          routerConfig: router,
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 200));

    expect(find.text('Hoje'), findsOneWidget);
    expect(find.text('Ontem'), findsOneWidget);
    expect(find.text('Anteriores'), findsOneWidget);
    expect(find.text('Trabalho devolvido: Resumo de História'), findsOneWidget);
    expect(find.text('Trabalho corrigido'), findsOneWidget);
    expect(find.text('Reunião de encarregados'), findsOneWidget);
    expect(find.byTooltip('Marcar tudo como lido'), findsOneWidget);

    await tester.tap(find.text('Por ler'));
    await tester.pump();
    expect(find.text('Trabalho devolvido: Resumo de História'), findsOneWidget);
    expect(find.text('Avaliação marcada: Física'), findsNothing);
    expect(find.text('Reunião de encarregados'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('sem conta do SIGA, diz de onde vêm os avisos', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authProvider.overrideWith(_Parent.new),
          currentUidProvider.overrideWithValue('u1'),
          personalNoticesProvider.overrideWith((ref) async => NoticeFeed.empty),
          parentNoticesProvider.overrideWith((ref) async => const []),
        ],
        child: const MaterialApp(home: NotificationsScreen(enabled: false)),
      ),
    );
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('Os avisos chegam pela conta do SIGA.'), findsOneWidget);
  });
}
