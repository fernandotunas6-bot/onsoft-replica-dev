import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:yft_school_system/core/auth/password_change.dart';
import 'package:yft_school_system/core/widgets/temporary_access_dialog.dart';

void main() {
  test('validação da troca de senha', () {
    expect(passwordChangeProblem('', 'novaSenha1', 'novaSenha1'), isNotNull);
    expect(passwordChangeProblem('antiga', 'curta', 'curta'), contains('8'));
    expect(
      passwordChangeProblem('antiga', 'novaSenha1', 'novaSenha2'),
      contains('coincidem'),
    );
    expect(
      passwordChangeProblem('igualzinha', 'igualzinha', 'igualzinha'),
      contains('diferente'),
    );
    expect(passwordChangeProblem('antiga', 'novaSenha1', 'novaSenha1'), isNull);
  });

  Future<void> open(WidgetTester tester, {required String? password}) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => TextButton(
            onPressed: () => showTemporaryAccessDialog(
              context,
              who: 'Prof. Teste',
              loginEmail: 'prof@escola.ao',
              temporaryPassword: password,
            ),
            child: const Text('abrir'),
          ),
        ),
      ),
    );
    await tester.tap(find.text('abrir'));
    await tester.pumpAndSettle();
  }

  testWidgets('mostra o acesso uma vez e só fecha com «Já anotei»', (
    tester,
  ) async {
    await open(tester, password: 'Ab3dEf6hJk9m');
    expect(find.text('Acesso de Prof. Teste'), findsOneWidget);
    expect(find.text('prof@escola.ao'), findsOneWidget);
    expect(find.text('Ab3dEf6hJk9m'), findsOneWidget);

    await tester.tapAt(const Offset(5, 5)); // fora do diálogo
    await tester.pumpAndSettle();
    expect(find.text('Ab3dEf6hJk9m'), findsOneWidget);

    await tester.tap(find.text('Já anotei'));
    await tester.pumpAndSettle();
    expect(find.text('Ab3dEf6hJk9m'), findsNothing);
  });

  testWidgets('sem senha (encarregado já existente), não mostra nada', (
    tester,
  ) async {
    await open(tester, password: null);
    expect(find.byType(AlertDialog), findsNothing);
  });
}
