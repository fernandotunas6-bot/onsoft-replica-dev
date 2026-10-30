import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:yft_school_system/core/theme/app_theme.dart';
import 'package:yft_school_system/features/splash/presentation/splash_screen.dart';

void main() {
  testWidgets('SplashScreen shows the SIGA Plus brand and drains navigation timer',
      (WidgetTester tester) async {
    final router = GoRouter(
      initialLocation: '/',
      routes: [
        GoRoute(
          path: '/',
          builder: (context, state) => const SplashScreen(),
        ),
        GoRoute(
          path: '/bem-vindo',
          builder: (context, state) =>
              const Scaffold(body: SizedBox.shrink()),
        ),
        GoRoute(
          path: '/login',
          builder: (context, state) =>
              const Scaffold(body: SizedBox.shrink()),
        ),
      ],
    );

    await tester.pumpWidget(
      MaterialApp.router(
        theme: AppTheme.build(),
        routerConfig: router,
      ),
    );

    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('Plus'), findsOneWidget);
    expect(
      find.text('Educação que transforma\nem qualquer lugar'),
      findsOneWidget,
    );

    await tester.pump(const Duration(seconds: 4));
    await tester.pumpAndSettle();
  });
}
