import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:siga_plus_flutter/config.dart';
import 'package:siga_plus_flutter/pages/login_page.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

AppConfig config({
  String url = 'https://xodgfmxiaunpamctfeea.supabase.co',
  String key = 'sb_publishable_abc',
  String origin = 'https://m.portal-siga.com',
  String google = 'false',
  bool web = false,
}) => AppConfig.fromValues(
  supabaseUrl: url,
  publishableKey: key,
  apiOrigin: origin,
  googleLogin: google,
  authRedirect: '',
  web: web,
  base: Uri.parse('https://m.portal-siga.com/home?x=1#y'),
);

void main() {
  test('configuração completa com o domínio m.portal-siga.com', () {
    final c = config();
    expect(c.problems, isEmpty);
    expect(c.apiOrigin, Uri.parse('https://m.portal-siga.com'));
    expect(c.googleLogin, isFalse);
    expect(c.authRedirect, AppConfig.defaultAuthRedirect);
  });

  test('aponta o que falta em vez de arrancar meio configurada', () {
    final c = config(url: '', key: 'eyJ.service_role', origin: 'http://x');
    expect(c.problems, hasLength(3));
  });

  test(
    'Google: no browser regressa à página, no Android ao esquema da app',
    () {
      expect(config(google: 'true').googleLogin, isTrue);
      expect(config(web: true).authRedirect, 'https://m.portal-siga.com/');
    },
  );

  testWidgets('o botão Google só entra quando o .env o liga', (tester) async {
    tester.view.physicalSize = const Size(1170, 2532);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    final auth = GoTrueClient(
      url: 'https://example.test/auth/v1',
      autoRefreshToken: false,
    );
    var opened = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: LoginPage(auth: auth, onSync: () async {}),
      ),
    );
    // Os três botões das referências estão sempre lá; sem o .env, explicam.
    await tester.tap(find.bySemanticsLabel('Continuar com Google'));
    await tester.pump();
    expect(find.textContaining('ainda não está activo'), findsOneWidget);
    await tester.pumpWidget(
      MaterialApp(
        home: LoginPage(
          auth: auth,
          onSync: () async {},
          onGoogle: () async => opened++,
        ),
      ),
    );
    await tester.tap(find.bySemanticsLabel('Continuar com Google'));
    await tester.pump();
    expect(opened, 1);
  });
}
