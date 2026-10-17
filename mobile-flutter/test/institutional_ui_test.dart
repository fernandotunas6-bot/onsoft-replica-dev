import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:siga_plus_flutter/chat_history.dart';
import 'package:siga_plus_flutter/design/tokens.dart';
import 'package:siga_plus_flutter/gateway.dart';
import 'package:siga_plus_flutter/institutional_page.dart';

http.Response json(Map<String, dynamic> body) => http.Response.bytes(
  utf8.encode(jsonEncode(body)),
  200,
  headers: {'content-type': 'application/json; charset=utf-8'},
);

MobileGateway gateway(Future<http.Response> Function(http.Request) handler) {
  final g = MobileGateway(
    Uri.parse('https://example.test'),
    () async => 'token',
    client: MockClient(handler),
  );
  g.select('aluno-1', 'school-a', 'aluno');
  return g;
}

Widget app(Widget child) => MaterialApp(
  theme: sigaTheme(Brightness.light, Siga.institutionalBlue),
  home: Scaffold(body: child),
);

const context = {'schoolId': 'school-a', 'role': 'aluno', 'userId': 'aluno-1'};

void main() {
  testWidgets('notas publicadas: média, parciais e resultado em português', (
    tester,
  ) async {
    await tester.pumpWidget(
      app(
        InstitutionalPage(
          collection: 'results',
          gateway: gateway(
            (_) async => json({
              ...context,
              'sheets': [
                {
                  'title': 'I Trimestre',
                  'kind': 'term',
                  'publishedAt': '2026-10-15T10:00:00Z',
                  'continuousAverage': 15.2,
                  'examAverage': null,
                  'termAverage': 14,
                  'result': 'pass',
                },
              ],
            }),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Aprovado'), findsOneWidget);
    expect(find.text('14'), findsOneWidget);
    expect(find.text('15,2'), findsOneWidget);
    expect(find.text('—'), findsOneWidget); // provas ainda sem média
    expect(find.textContaining('publicada a 15/10/2026'), findsOneWidget);
  });

  testWidgets('documentos mostram o estado em português', (tester) async {
    await tester.pumpWidget(
      app(
        InstitutionalPage(
          collection: 'documents',
          gateway: gateway(
            (_) async => json({
              ...context,
              'requests': [
                {'document': 'Declaração de matrícula', 'status': 'approved'},
                {'document': 'Certificado', 'status': 'in_review'},
              ],
            }),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Pronto a levantar'), findsOneWidget);
    expect(find.text('Em análise'), findsOneWidget);
  });

  testWidgets('propinas: estado da factura e recibos, sem saldo inventado', (
    tester,
  ) async {
    await tester.pumpWidget(
      app(
        InstitutionalPage(
          collection: 'finance',
          gateway: gateway(
            (_) async => json({
              ...context,
              'invoices': [
                {
                  'label': 'Propina de Outubro',
                  'number': 'F-12',
                  'status': 'partially_paid',
                  'amountCents': 2500000,
                  'due': '2026-10-10',
                  'receipts': [
                    {
                      'number': 'R-7',
                      'amountCents': 1000000,
                      'status': 'issued',
                    },
                  ],
                },
              ],
            }),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Pago em parte'), findsOneWidget);
    expect(find.text('Valor base: 25\u00a0000,00'), findsOneWidget);
    expect(find.text('Recibo R-7 · 10\u00a0000,00'), findsOneWidget);
    expect(find.text('Emitido'), findsOneWidget);
  });

  testWidgets('valor que não é inteiro em cêntimos mostra erro, não dados', (
    tester,
  ) async {
    await tester.pumpWidget(
      app(
        InstitutionalPage(
          collection: 'finance',
          gateway: gateway(
            (_) async => json({
              ...context,
              'invoices': [
                {
                  'label': 'Propina',
                  'number': 'F-1',
                  'status': 'open',
                  'amountCents': 12.5,
                  'due': '2026-10-10',
                  'receipts': [],
                },
              ],
            }),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('Não foi possível carregar'), findsOneWidget);
  });

  testWidgets('chat: balões por autor e páginas antigas acima das recentes', (
    tester,
  ) async {
    Map<String, dynamic> message(String id, String sender, String body) => {
      'id': id,
      'senderId': sender,
      'senderName': sender == 'aluno-1' ? 'Ana Souza' : 'Prof. Carlos',
      'body': body,
      'createdAt': '2026-10-13T0${id.substring(1)}:00:00Z',
      'deleted': false,
      'status': 'read',
      'reply': null,
      'attachment': null,
    };
    await tester.pumpWidget(
      MaterialApp(
        theme: sigaTheme(Brightness.light, Siga.institutionalBlue),
        home: ChatHistoryPage(
          id: 'c1',
          name: 'Prof. Carlos',
          gateway: gateway((request) async {
            final older = request.url.queryParameters.containsKey('before');
            return json({
              ...context,
              'conversationId': 'c1',
              'messages': older
                  ? [message('m1', 'prof', 'Primeira')]
                  : [
                      message('m3', 'prof', 'Terceira'),
                      message('m4', 'aluno-1', 'Quarta'),
                    ],
              'next': older
                  ? null
                  : {'date': '2026-10-13T03:00:00Z', 'id': 'm3'},
            });
          }),
        ),
      ),
    );
    await tester.pumpAndSettle();
    // Minha mensagem à direita, a do professor à esquerda.
    expect(
      tester.getCenter(find.text('Quarta')).dx,
      greaterThan(tester.getCenter(find.text('Terceira')).dx),
    );
    await tester.tap(find.text('Mensagens mais antigas'));
    await tester.pumpAndSettle();
    final first = tester.getTopLeft(find.text('Primeira')).dy;
    final third = tester.getTopLeft(find.text('Terceira')).dy;
    expect(first, lessThan(third));
    expect(find.text('Mensagens mais antigas'), findsNothing);
  });
}
