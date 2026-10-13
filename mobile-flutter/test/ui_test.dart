import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:siga_plus_flutter/access_page.dart';
import 'package:siga_plus_flutter/design.dart';
import 'package:siga_plus_flutter/services_page.dart';

Future<void> show(WidgetTester tester, Widget child) => tester.pumpWidget(
  MaterialApp(theme: sigaTheme(Brightness.light), home: child),
);

void main() {
  testWidgets(
    'a service without a verified contract opens the preparation page, never a dead shortcut',
    (tester) async {
      final opened = <String>[];
      SchoolService? previewed;
      await show(
        tester,
        Scaffold(
          body: ServicesPage(
            name: 'Ana Souza',
            role: 'aluno',
            schoolName: 'Instituto',
            modernIcons: true,
            onOpen: opened.add,
            onPreview: (service) => previewed = service,
            onAccount: () {},
          ),
        ),
      );
      await tester.tap(find.text('Disciplinas'));
      expect(opened, ['/subjects']);
      await tester.tap(find.text('Aulas online'));
      expect(opened, [
        '/subjects',
      ], reason: 'a service without a contract must not navigate');
      expect(previewed?.label, 'Aulas online');
      expect(previewed?.route, isNull);
    },
  );

  testWidgets('the teacher profile is not offered the pupil marks service', (
    tester,
  ) async {
    await show(
      tester,
      Scaffold(
        body: ServicesPage(
          name: 'Carlos Mendes',
          role: 'professor',
          schoolName: 'Instituto',
          modernIcons: true,
          onOpen: (_) {},
          onPreview: (_) {},
          onAccount: () {},
        ),
      ),
    );
    expect(find.text('Notas'), findsNothing);
    expect(find.text('Turmas'), findsOneWidget);
  });

  testWidgets(
    'appearance changes are reported to the shell instead of kept locally',
    (tester) async {
      var value = const Appearance();
      await show(
        tester,
        StatefulBuilder(
          builder: (context, setState) => AppearancePage(
            value: value,
            onBack: () {},
            onChanged: (next) => setState(() => value = next),
          ),
        ),
      );
      await tester.tap(find.text('Escuro'));
      await tester.pumpAndSettle();
      expect(value.mode, ThemeMode.dark);
      await tester.tap(find.byType(Switch).first);
      await tester.pumpAndSettle();
      expect(value.reducedMotion, isTrue);
    },
  );

  testWidgets('the transport page states that it is a simulation without GPS', (
    tester,
  ) async {
    await show(tester, TransportPage(onBack: () {}));
    expect(find.text('Simulação'), findsOneWidget);
    expect(find.text('Conceito'), findsOneWidget);
    expect(find.textContaining('sem localização GPS real'), findsOneWidget);
    expect(find.text('A aguardar GPS'), findsOneWidget);
  });

  testWidgets(
    'only active memberships are listed and a double profile is chosen explicitly',
    (tester) async {
      final chosen = <String>[];
      await show(
        tester,
        SchoolsPage(
          memberships: const [
            {
              'schoolId': 'school-a',
              'schoolName': 'Instituto Adventista',
              'active': true,
              'roles': ['aluno', 'professor'],
            },
            {
              'schoolId': 'school-b',
              'schoolName': 'Escola Suspensa',
              'active': false,
              'roles': ['aluno'],
            },
          ],
          onSelected: (school, role) => chosen.add('$school:$role'),
          onSignOut: () {},
          onRetry: () {},
        ),
      );
      expect(find.text('Escola Suspensa'), findsNothing);
      await tester.tap(find.text('Instituto Adventista'));
      await tester.pumpAndSettle();
      expect(
        chosen,
        isEmpty,
        reason: 'two profiles must be disambiguated by the person',
      );
      await tester.tap(find.text('Professor'));
      await tester.pumpAndSettle();
      expect(chosen, ['school-a:professor']);
    },
  );

  testWidgets(
    'a provider button explains the limit instead of pretending to sign in',
    (tester) async {
      await show(
        tester,
        Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: TextButton(
                onPressed: () => pending(
                  context,
                  'Entrada com Google',
                  'Precisa de PKCE e callback autorizado.',
                ),
                child: const Text('Google'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Google'));
      await tester.pumpAndSettle();
      expect(find.text('Entrada com Google'), findsOneWidget);
      expect(find.textContaining('callback autorizado'), findsOneWidget);
    },
  );
}
