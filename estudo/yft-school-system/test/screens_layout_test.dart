import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:yft_school_system/core/auth/auth_state.dart';
import 'package:yft_school_system/core/theme/app_theme.dart';
import 'package:yft_school_system/features/auth/presentation/forgot_password_screen.dart';
import 'package:yft_school_system/features/auth/presentation/login_screen.dart';
import 'package:yft_school_system/features/profile/presentation/help_support_screen.dart';
import 'package:yft_school_system/features/profile/presentation/notification_settings_screen.dart';
import 'package:yft_school_system/features/profile/presentation/personal_info_screen.dart';
import 'package:yft_school_system/features/profile/presentation/privacy_policy_screen.dart';
import 'package:yft_school_system/core/network/api_client.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';
import 'package:yft_school_system/features/academics/presentation/academic_calendar_screen.dart';
import 'package:yft_school_system/features/dashboard/presentation/dashboard_screen.dart';
import 'package:yft_school_system/features/dashboard/presentation/providers/notices_providers.dart';
import 'package:yft_school_system/features/profile/presentation/security_settings_screen.dart';

/// Sessão fixa: o notificador verdadeiro tenta restaurar a sessão no Firebase,
/// que não existe no teste.
class _FixedSession extends AuthStateNotifier {
  _FixedSession(this.session);
  final AppSession? session;
  @override
  AppSession? build() => session;
}

/// O interceptor verdadeiro pede o token a FirebaseAuth.instance, que não
/// existe no teste. Este adaptador responde 503 de imediato: os ecrãs já
/// tratam a falha, e é o estado sem dados que se quer ver desenhado.
class _OfflineAdapter implements HttpClientAdapter {
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async => ResponseBody.fromString(
    jsonEncode({'error': 'sem rede no teste'}),
    503,
    headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    },
  );

  @override
  void close({bool force = false}) {}
}

Dio _offlineDio() => Dio()..httpClientAdapter = _OfflineAdapter();

/// Sem API: os dados chegam vazios, que é o estado em que os ecrãs mais
/// facilmente esticam texto sem o encurtar.
final noData = <Override>[
  dioProvider.overrideWith((ref) => _offlineDio()),
  classesProvider.overrideWith((ref) async => []),
  arrearsProvider.overrideWith((ref) async => []),
  unreadNoticesCountProvider.overrideWith((ref) async => 0),
];

AppSession _parent() => AppSession(
  role: UserRole.parent,
  userName: 'Encarregado de educação com nome comprido',
  schoolId: 'sch_1',
  uid: 'uid_2',
  schoolName: 'Colégio Lwini do Rangel',
);

AppSession adminSession({bool teacherCanEditResults = true}) => AppSession(
  role: UserRole.admin,
  userName: 'Maria Domingos',
  schoolId: 'sch_1',
  uid: 'uid_1',
  schoolName: 'Colégio Lwini',
  teacherCanEditResults: teacherCanEditResults,
);

/// 390×844 é o tamanho das capturas em yft-estudo-capturas. Um transbordo de
/// layout levanta FlutterError e faz o teste falhar: é essa a verificação.
Future<void> show(
  WidgetTester tester,
  Widget screen, {
  AppSession? session,
  List<Override> overrides = const [],
}) async {
  tester.view
    ..devicePixelRatio = 1.0
    ..physicalSize = const Size(390, 844);
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        authProvider.overrideWith(() => _FixedSession(session)),
        ...overrides,
      ],
      child: MaterialApp(theme: AppTheme.lightTheme, home: screen),
    ),
  );
  // pumpAndSettle para as chamadas de initState terminarem antes de medir.
  await tester.pumpAndSettle(const Duration(milliseconds: 100));
}

void main() {
  testWidgets('entrada: o formulário cabe no ecrã e está em português', (
    tester,
  ) async {
    await show(tester, const LoginScreen());
    expect(find.text('Bem-vindo de volta'), findsOneWidget);
    expect(find.text('Entrar'), findsWidgets);
    expect(find.text('Esqueceu-se da palavra-passe?'), findsOneWidget);
  });

  testWidgets('recuperar palavra-passe cabe no ecrã', (tester) async {
    await show(tester, const ForgotPasswordScreen());
    expect(find.textContaining('Escreva o e-mail registado'), findsWidgets);
  });

  testWidgets('política de privacidade cabe no ecrã', (tester) async {
    await show(tester, const PrivacyPolicyScreen());
    expect(find.text('A sua privacidade é importante'), findsOneWidget);
    expect(find.textContaining('Que dados recolhemos'), findsOneWidget);
  });

  testWidgets('ajuda e apoio cabe no ecrã', (tester) async {
    await show(tester, const HelpSupportScreen());
    expect(find.text('Como podemos ajudar?'), findsOneWidget);
    expect(find.text('Perguntas frequentes'), findsOneWidget);
  });

  testWidgets('notificações: as linhas longas não transbordam', (tester) async {
    await show(tester, const NotificationSettingsScreen());
    expect(find.text('Notificações na aplicação'), findsOneWidget);
    expect(
      find.text('Receber um resumo dos avisos por e-mail.'),
      findsOneWidget,
    );
    expect(find.text('Propinas e pagamentos'), findsOneWidget);
  });

  testWidgets('dados pessoais cabe no ecrã', (tester) async {
    await show(tester, const PersonalInfoScreen());
    expect(find.text('Nome completo'), findsWidgets);
    expect(find.text('Morada'), findsWidgets);
  });

  testWidgets('segurança: o aviso de edição de notas não transborda', (
    tester,
  ) async {
    await show(
      tester,
      const SecuritySettingsScreen(),
      session: adminSession(teacherCanEditResults: true),
    );
    expect(
      find.text('Permitir que os professores lancem notas'),
      findsOneWidget,
    );
    expect(
      find.text('Neste momento os professores podem lançar e alterar notas.'),
      findsOneWidget,
    );
  });

  testWidgets('segurança: o estado desligado também cabe', (tester) async {
    await show(
      tester,
      const SecuritySettingsScreen(),
      session: adminSession(teacherCanEditResults: false),
    );
    expect(
      find.text(
        'Os professores só podem consultar notas. A edição está desligada.',
      ),
      findsOneWidget,
    );
  });

  testWidgets(
    'calendário académico: a falha da API não despeja o Dio no ecrã',
    (tester) async {
      await show(
        tester,
        const AcademicCalendarScreen(),
        session: adminSession(),
        overrides: noData,
      );
      expect(find.text('Calendário académico'), findsWidgets);
      expect(
        find.textContaining('Não foi possível carregar o calendário'),
        findsOneWidget,
      );
      // A excepção do Dio ia inteira para o ecrã, com o texto interno sobre
      // validateStatus.
      expect(find.textContaining('DioException'), findsNothing);
      expect(find.textContaining('validateStatus'), findsNothing);
    },
  );

  testWidgets('painel do administrador cabe no ecrã, mesmo sem dados', (
    tester,
  ) async {
    await show(
      tester,
      const DashboardScreen(),
      session: adminSession(),
      overrides: noData,
    );
    expect(find.textContaining('Olá'), findsOneWidget);
  });

  testWidgets('painel do encarregado cabe com um nome de escola comprido', (
    tester,
  ) async {
    await show(
      tester,
      const DashboardScreen(),
      session: _parent(),
      overrides: noData,
    );
    expect(find.textContaining('Olá'), findsOneWidget);
  });
}
