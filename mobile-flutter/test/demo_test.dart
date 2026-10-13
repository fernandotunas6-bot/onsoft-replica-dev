import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:siga_plus_flutter/main_demo.dart';

void main() {
  testWidgets('demonstração: abertura, apresentação, escola e início', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1170, 2532);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(const DemoApp());
    expect(
      find.text('Demonstração · dados fictícios · sem ligação ao SIGA'),
      findsOneWidget,
    );
    await tester.tap(find.text('Saltar'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Saltar'));
    await tester.pumpAndSettle(const Duration(milliseconds: 500));
    expect(find.text('Seleccione a sua escola'), findsOneWidget);
    await tester.tap(find.text('Escola Central da Luz (demonstração)'));
    await tester.pumpAndSettle(const Duration(milliseconds: 500));
    expect(find.text('Bem-vindo, Ana!'), findsOneWidget);
    await tester.tap(find.text('Mais').last);
    await tester.pumpAndSettle(const Duration(milliseconds: 500));
    expect(find.text('Serviços escolares'), findsOneWidget);
    for (final tile in [
      'WhatsApp',
      'Google',
      'Propinas',
      'Biblioteca',
      'Notas',
    ]) {
      expect(find.text(tile), findsOneWidget, reason: tile);
    }
    await tester.tap(find.text('Mensagens').last);
    await tester.pumpAndSettle(const Duration(milliseconds: 500));
    expect(find.text('Prof. Carlos Mendes'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });
}
