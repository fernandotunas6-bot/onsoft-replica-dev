import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:siga_plus_flutter/pages/gradebooks_page.dart';

void main() {
  test('notas com vírgula e uma casa; inteiros sem casas', () {
    expect(scoreText(15), '15');
    expect(scoreText(12.5), '12,5');
    expect(scoreText(13.333), '13,3');
  });

  testWidgets('pauta: média só das notas lançadas e contagem', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: GradebookDetailPage(
          title: 'Matemática · 10.ª A',
          students: {'e1': 'Ana', 'e2': 'Bruno', 'e3': 'Carla'},
          book: {
            'status': 'open',
            'term': {'name': 'I Trimestre'},
            'items': [
              {
                'code': 'MAC',
                'name': 'Avaliação contínua',
                'maxScore': 20,
                'sequence': 1,
                'scores': [
                  {'enrollmentId': 'e1', 'value': 16, 'status': 'draft'},
                  {'enrollmentId': 'e2', 'value': 9, 'status': 'locked'},
                  {'enrollmentId': 'e3', 'value': null, 'status': 'draft'},
                ],
              },
            ],
          },
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('12,5'), findsOneWidget); // (16 + 9) / 2
    expect(find.text('2 de 3 lançadas'), findsOneWidget);
    expect(find.text('—'), findsOneWidget); // Carla sem nota
    expect(find.text('Aberta'), findsOneWidget);
  });
}
