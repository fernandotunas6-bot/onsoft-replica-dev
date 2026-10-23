import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:siga_plus_flutter/captcha.dart';
import 'package:siga_plus_flutter/main.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class FakeGate implements CaptchaGate {
  FakeGate({this.configured = true, this.supported = true, this.value});
  @override
  final bool configured;
  @override
  final bool supported;
  String? value;
  int resets = 0;
  @override
  String? get token => value;
  @override
  Widget? build(BuildContext context) => const Text('desafio');
  @override
  void reset() {
    resets++;
    value = null;
  }

  @override
  void dispose() {}
}

Future<void> submit(WidgetTester tester) async {
  final button = find.text('Entrar');
  await tester.ensureVisible(button);
  await tester.pump();
  await tester.tap(button);
}

Future<void> fill(WidgetTester tester) async {
  final fields = find.byType(TextField);
  await tester.enterText(fields.at(0), 'aluno@escola.ao');
  await tester.enterText(fields.at(1), 'senha-de-teste');
}

Future<void> pump(
  WidgetTester tester,
  FakeGate gate, {
  PasswordSignIn? signIn,
  IdentifierSignIn? signInWithIdentifier,
  bool allowIdentifier = false,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      home: LoginPage(
        auth: GoTrueClient(url: 'http://localhost:1', autoRefreshToken: false),
        onSync: () async {},
        siteKey: gate.configured ? 'chave-publica-de-teste' : '',
        buildGate: (_, _) => gate,
        signIn: signIn,
        signInWithIdentifier: signInWithIdentifier,
        allowIdentifier: allowIdentifier,
      ),
    ),
  );
  await tester.pump();
}

void main() {
  testWidgets('no request without an anti-robot signal', (tester) async {
    var calls = 0;
    final gate = FakeGate();
    await pump(
      tester,
      gate,
      signIn: ({required email, required password, captchaToken}) async =>
          calls++,
    );
    await fill(tester);
    await submit(tester);
    await tester.pump();
    expect(calls, 0);
    expect(find.textContaining('não é um robô'), findsOneWidget);
  });

  testWidgets('the signal travels and is spent once', (tester) async {
    String? sent;
    final gate = FakeGate(value: 'sinal-hcaptcha');
    await pump(
      tester,
      gate,
      signIn: ({required email, required password, captchaToken}) async {
        sent = captchaToken;
      },
    );
    await fill(tester);
    await submit(tester);
    await tester.pumpAndSettle();
    expect(sent, 'sinal-hcaptcha');
    expect(gate.resets, 1);
    expect(gate.token, isNull);
  });

  testWidgets('a captcha refusal names the missing configuration', (
    tester,
  ) async {
    final gate = FakeGate(configured: false);
    await pump(
      tester,
      gate,
      signIn: ({required email, required password, captchaToken}) async {
        throw AuthApiException('refused', code: 'captcha_failed');
      },
    );
    await fill(tester);
    await submit(tester);
    await tester.pumpAndSettle();
    // Frase exclusiva da recusa do Auth: o aviso estático de configuração em
    // falta também nomeia a chave, e o teste tem de distinguir os dois.
    expect(
      find.textContaining('está activa no servidor mas não está'),
      findsOneWidget,
    );
  });

  testWidgets('a target without the challenge says so instead of guessing', (
    tester,
  ) async {
    await pump(tester, FakeGate(supported: false));
    expect(find.textContaining('portal original'), findsOneWidget);
    expect(find.text('desafio'), findsNothing);
  });

  testWidgets('the B.I. option only appears where the endpoint is mounted', (
    tester,
  ) async {
    await pump(tester, FakeGate(value: 'sinal'));
    expect(find.text('B.I. ou telefone'), findsNothing);
    await pump(tester, FakeGate(value: 'sinal'), allowIdentifier: true);
    expect(find.text('B.I. ou telefone'), findsOneWidget);
  });

  testWidgets('the identifier travels to the server, never an e-mail guess', (
    tester,
  ) async {
    String? sentIdentifier;
    var passwordCalls = 0;
    await pump(
      tester,
      FakeGate(value: 'sinal'),
      allowIdentifier: true,
      signIn: ({required email, required password, captchaToken}) async =>
          passwordCalls++,
      signInWithIdentifier:
          ({required identifier, required password, captchaToken}) async {
            sentIdentifier = identifier;
          },
    );
    await tester.tap(find.text('B.I. ou telefone'));
    await tester.pump();
    final fields = find.byType(TextField);
    await tester.enterText(fields.at(0), ' 003456789LA042 ');
    await tester.enterText(fields.at(1), 'senha-de-teste');
    await submit(tester);
    await tester.pumpAndSettle();
    expect(sentIdentifier, '003456789LA042');
    expect(passwordCalls, 0);
  });

  testWidgets('a short identifier does not spend the server allowance', (
    tester,
  ) async {
    var calls = 0;
    await pump(
      tester,
      FakeGate(value: 'sinal'),
      allowIdentifier: true,
      signInWithIdentifier:
          ({required identifier, required password, captchaToken}) async =>
              calls++,
    );
    await tester.tap(find.text('B.I. ou telefone'));
    await tester.pump();
    final fields = find.byType(TextField);
    await tester.enterText(fields.at(0), 'ab');
    await tester.enterText(fields.at(1), 'senha-de-teste');
    await submit(tester);
    await tester.pump();
    expect(calls, 0);
    expect(find.textContaining('número de B.I.'), findsOneWidget);
  });
}
