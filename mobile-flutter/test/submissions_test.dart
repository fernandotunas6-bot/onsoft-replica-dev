import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:siga_plus_flutter/gateway.dart';
import 'package:siga_plus_flutter/pages/task_sheet.dart';

http.Response json(Object body, [int status = 200]) => http.Response.bytes(
  utf8.encode(jsonEncode(body)),
  status,
  headers: {'content-type': 'application/json; charset=utf-8'},
);

const context = {'schoolId': 'school', 'userId': 'user'};

MobileGateway gateway(
  String role,
  Future<http.Response> Function(http.Request) handler,
) {
  final g = MobileGateway(
    Uri.parse('https://example.test'),
    () async => 'token',
    client: MockClient(handler),
  );
  g.select('user', 'school', role);
  return g;
}

void main() {
  group('gateway', () {
    test('envio: pede URL, envia os bytes para lá e regista', () async {
      final calls = <http.Request>[];
      final g = gateway('aluno', (request) async {
        calls.add(request);
        if (request.method == 'PUT') return http.Response('{}', 200);
        if (request.url.path.endsWith('/submission-upload')) {
          return json({
            ...context,
            'role': 'aluno',
            'path': 'school/2026/10/submissions/user/x-a.pdf',
            'uploadUrl': 'https://sga.test/upload?token=t',
          });
        }
        return json({
          ...context,
          'role': 'aluno',
          'submission': {'id': 's1', 'fileName': 'a.pdf'},
        });
      });
      final bytes = utf8.encode('%PDF-1.7');
      final saved = await g.submitPdf(
        taskId: 't1',
        fileName: 'a.pdf',
        bytes: bytes,
      );
      expect(saved['id'], 's1');
      expect(calls.map((c) => c.method), ['POST', 'PUT', 'POST']);
      expect(calls[1].url.toString(), 'https://sga.test/upload?token=t');
      expect(calls[1].bodyBytes, bytes);
      expect(calls[1].headers['Content-Type'], 'application/pdf');
      final register = jsonDecode(calls[2].body) as Map<String, dynamic>;
      expect(register, {
        'role': 'aluno',
        'taskId': 't1',
        'path': 'school/2026/10/submissions/user/x-a.pdf',
      });
    });

    test('envio falhado para o armazenamento não regista a entrega', () async {
      final calls = <String>[];
      final g = gateway('aluno', (request) async {
        calls.add('${request.method} ${request.url.path}');
        if (request.method == 'PUT') return http.Response('erro', 500);
        return json({
          ...context,
          'role': 'aluno',
          'path': 'p',
          'uploadUrl': 'https://sga.test/upload',
        });
      });
      await expectLater(
        g.submitPdf(taskId: 't1', fileName: 'a.pdf', bytes: [1, 2, 3]),
        throwsA(
          isA<CommandError>().having((e) => e.code, 'code', 'UPLOAD_FAILED'),
        ),
      );
      expect(calls.where((c) => c.endsWith('/submission')), isEmpty);
    });

    test('migração por aplicar chega como mensagem clara', () async {
      final g = gateway(
        'aluno',
        (_) async => json({'error': 'SUBMISSIONS_NOT_READY'}, 503),
      );
      await expectLater(
        g.submissions(taskId: 't1'),
        throwsA(
          isA<CommandError>().having(
            (e) => e.message,
            'message',
            contains('ainda não está activa'),
          ),
        ),
      );
    });
  });

  group('secção de entrega', () {
    Future<void> show(
      WidgetTester tester,
      MobileGateway g, {
      bool open = true,
    }) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SubmissionSection(gateway: g, taskId: 't1', open: open),
          ),
        ),
      );
      await tester.pumpAndSettle();
    }

    testWidgets('aluno sem entrega vê «Entregar PDF»', (tester) async {
      await show(
        tester,
        gateway(
          'aluno',
          (_) async => json({...context, 'role': 'aluno', 'submissions': []}),
        ),
      );
      expect(find.text('Entregar PDF'), findsOneWidget);
      expect(find.textContaining('Ainda não entregou'), findsOneWidget);
    });

    testWidgets('aluno com entrega vê o ficheiro e «Substituir PDF»', (
      tester,
    ) async {
      await show(
        tester,
        gateway(
          'aluno',
          (_) async => json({
            ...context,
            'role': 'aluno',
            'submissions': [
              {
                'id': 's1',
                'fileName': 'trabalho.pdf',
                'sizeBytes': 2 * 1024 * 1024,
                'version': 2,
                'submittedAt': '2026-10-16T10:00:00Z',
              },
            ],
          }),
        ),
      );
      expect(find.text('trabalho.pdf'), findsOneWidget);
      expect(find.textContaining('2,0 MB'), findsOneWidget);
      expect(find.textContaining('versão 2'), findsOneWidget);
      expect(find.text('Substituir PDF'), findsOneWidget);
    });

    testWidgets('prazo terminado: sem botão de envio', (tester) async {
      await show(
        tester,
        gateway(
          'aluno',
          (_) async => json({...context, 'role': 'aluno', 'submissions': []}),
        ),
        open: false,
      );
      expect(find.text('Entregar PDF'), findsNothing);
      expect(find.text('Não entregou dentro do prazo.'), findsOneWidget);
    });

    testWidgets('professor vê quem entregou', (tester) async {
      await show(
        tester,
        gateway(
          'professor',
          (_) async => json({
            ...context,
            'role': 'professor',
            'taskId': 't1',
            'submissions': [
              {
                'id': 's1',
                'studentName': 'Bruno Kiala',
                'fileName': 'b.pdf',
                'sizeBytes': 512000,
                'version': 1,
                'submittedAt': '2026-10-16T10:00:00Z',
              },
            ],
          }),
        ),
      );
      expect(find.text('Entregas'), findsOneWidget);
      expect(find.text('Bruno Kiala'), findsOneWidget);
      expect(find.text('Entregar PDF'), findsNothing);
    });
  });
}
