import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:siga_plus_flutter/gateway.dart';
import 'package:siga_plus_flutter/records_page.dart';

const school = 'escola-1';
const user = 'utilizador-1';

MobileGateway gatewayFor(Object body, {int status = 200}) {
  final gateway = MobileGateway(
    Uri.parse('https://m.portal-siga.com'),
    () async => 'token',
    client: MockClient(
      (_) async =>
          http.Response(body is String ? body : jsonEncode(body), status),
    ),
  );
  gateway.select(user, school, 'aluno');
  return gateway;
}

Map<String, dynamic> envelope(List<Map<String, dynamic>> items) => {
  'version': 1,
  'schoolId': school,
  'role': 'aluno',
  'userId': user,
  'items': items,
};

Future<void> show(
  WidgetTester tester,
  MobileGateway gateway,
  String collection,
) async {
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: RecordsPage(gateway: gateway, collection: collection),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('a published grade is shown in the school scale', (tester) async {
    await show(
      tester,
      gatewayFor(
        envelope([
          {
            'id': 'g1',
            'classSubjectId': 'cs1',
            'subjectName': 'Matemática',
            'termName': 'I Trimestre',
            'kind': 'Prova',
            'status': 'published',
            'value': 14,
            'scaleMax': 20,
            'publishedAt': '2026-10-10T10:00:00Z',
          },
        ]),
      ),
      'results',
    );
    expect(find.text('Matemática'), findsOneWidget);
    expect(find.text('14 / 20'), findsOneWidget);
    expect(find.text('I Trimestre'), findsOneWidget);
  });

  testWidgets('a pending grade is not presented as a mark', (tester) async {
    await show(
      tester,
      gatewayFor(
        envelope([
          {
            'id': 'g1',
            'classSubjectId': 'cs1',
            'subjectName': 'Física',
            'termName': 'I Trimestre',
            'kind': 'Prova',
            'status': 'pending',
            'value': null,
            'scaleMax': null,
            'publishedAt': null,
          },
        ]),
      ),
      'results',
    );
    expect(find.text('Por publicar'), findsOneWidget);
    expect(find.textContaining('/'), findsNothing);
  });

  testWidgets('an invalid contract shows an error, never an empty list', (
    tester,
  ) async {
    await show(
      tester,
      gatewayFor(
        envelope([
          {
            'id': 'g1',
            'classSubjectId': 'cs1',
            'subjectName': 'Física',
            'termName': 'I Trimestre',
            'kind': 'Prova',
            'status': 'published',
            'value': 14,
            'scaleMax': null,
            'publishedAt': '2026-10-10T10:00:00Z',
          },
        ]),
      ),
      'results',
    );
    expect(find.textContaining('não correspondem ao contrato'), findsOneWidget);
    expect(find.text('Sem resultados neste vínculo.'), findsNothing);
  });

  testWidgets('notices list by date and say when more remain', (tester) async {
    await show(
      tester,
      gatewayFor({
        ...envelope([
          {
            'id': 'a1',
            'title': 'Reunião de encarregados',
            'body': 'Sábado às 9h.',
            'publishedAt': '2026-10-15T08:00:00Z',
            'category': 'Geral',
            'read': false,
          },
        ]),
        'nextCursor': 'cursor-opaco',
      }),
      'notices',
    );
    expect(find.text('Reunião de encarregados'), findsOneWidget);
    // 08:00Z é 09:00 em Luanda (UTC+1).
    expect(find.textContaining('Geral · 15/10/2026 · 09:00'), findsOneWidget);
    expect(find.textContaining('paginação ainda não está'), findsOneWidget);
  });

  testWidgets('a reply from another school never reaches the page', (
    tester,
  ) async {
    await show(
      tester,
      gatewayFor({
        'version': 1,
        'schoolId': 'outra-escola',
        'role': 'aluno',
        'userId': user,
        'items': const [],
      }),
      'notices',
    );
    expect(find.textContaining('Verifique a ligação'), findsOneWidget);
  });

  testWidgets('an empty feed says so plainly', (tester) async {
    await show(tester, gatewayFor(envelope(const [])), 'notices');
    expect(find.text('Sem avisos para os filtros escolhidos.'), findsOneWidget);
  });
}
