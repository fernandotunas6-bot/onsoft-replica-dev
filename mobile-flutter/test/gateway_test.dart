import 'dart:async';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:siga_plus_flutter/gateway.dart';

void main() {
  group('escritas no SIGA', () {
    late List<http.Request> sent;
    MobileGateway gatewayReplying(int status, Object body) {
      sent = [];
      final gateway = MobileGateway(
        Uri.parse('https://example.test'),
        () async => 'token',
        client: MockClient((request) async {
          sent.add(request);
          return http.Response(jsonEncode(body), status);
        }),
      );
      gateway.select('user', 'school', 'professor');
      return gateway;
    }

    test('chamada: POST JSON com papel, sem schoolId no corpo', () async {
      final gateway = gatewayReplying(200, {
        'schoolId': 'school',
        'status': 'completed',
      });
      await gateway.submitAttendance(
        classSubjectId: 'cs',
        date: '2026-10-17',
        statusByStudent: {'a': 'present', 'b': 'absent'},
      );
      final request = sent.single;
      expect(request.method, 'POST');
      expect(
        request.url.toString(),
        'https://example.test/api/mobile-v4/schools/school/attendance-call',
      );
      expect(request.headers['Authorization'], 'Bearer token');
      expect(request.headers['Content-Type'], startsWith('application/json'));
      final body = jsonDecode(request.body) as Map<String, dynamic>;
      expect(body.containsKey('schoolId'), isFalse);
      expect(body['role'], 'professor');
      expect(body['records'], [
        {'studentId': 'a', 'status': 'present'},
        {'studentId': 'b', 'status': 'absent'},
      ]);
    });

    test('erro do servidor vira mensagem em português', () async {
      final gateway = gatewayReplying(403, {'error': 'MFA_REQUIRED'});
      await expectLater(
        gateway.markNoticesRead(),
        throwsA(
          isA<CommandError>()
              .having((e) => e.code, 'code', 'MFA_REQUIRED')
              .having((e) => e.message, 'message', contains('dois passos')),
        ),
      );
    });

    test(
      'envio de mensagem leva requestId e aceita resposta sem escola',
      () async {
        final gateway = gatewayReplying(200, {
          'type': 'send',
          'conversationId': 'c',
          'messageId': 'm',
        });
        final result = await gateway.chatCommand({
          'type': 'send',
          'conversationId': 'c',
          'body': 'Olá',
        }, requestId: 'fixo');
        expect(result['messageId'], 'm');
        final body = jsonDecode(sent.single.body) as Map<String, dynamic>;
        expect(body['requestId'], 'fixo');
        expect(body['command']['body'], 'Olá');
      },
    );

    test('resposta de outra escola é recusada', () async {
      final gateway = gatewayReplying(200, {'schoolId': 'outra'});
      await expectLater(gateway.markNoticesRead(ids: ['x']), throwsStateError);
    });

    test('identificadores de pedido são UUID v4 distintos', () {
      final a = newRequestId();
      expect(
        RegExp(
          r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
        ).hasMatch(a),
        isTrue,
      );
      expect(newRequestId(), isNot(a));
    });
  });

  test('does not contact API without a session', () async {
    var calls = 0;
    final gateway = MobileGateway(
      Uri.parse('https://example.test'),
      () async => null,
      client: MockClient((_) async {
        calls++;
        return http.Response('{}', 200);
      }),
    );
    await expectLater(gateway.session(), throwsStateError);
    expect(calls, 0);
  });
  test('rejects cross-school response', () async {
    final gateway = MobileGateway(
      Uri.parse('https://example.test'),
      () async => 'token',
      client: MockClient(
        (_) async => http.Response('{"schoolId":"other","role":"aluno"}', 200),
      ),
    );
    gateway.select('user', 'school', 'aluno');
    await expectLater(gateway.read('academic'), throwsStateError);
  });
  test('discards outstanding response after school switch', () async {
    final response = Completer<http.Response>();
    final requested = Completer<void>();
    final gateway = MobileGateway(
      Uri.parse('https://example.test'),
      () async => 'token',
      client: MockClient((_) {
        requested.complete();
        return response.future;
      }),
    );
    gateway.select('user', 'school-a', 'aluno');
    final read = gateway.read('academic');
    final assertion = expectLater(read, throwsStateError);
    await requested.future;
    gateway.select('user', 'school-b', 'aluno');
    response.complete(
      http.Response('{"schoolId":"school-a","role":"aluno"}', 200),
    );
    await assertion;
  });
  test('preserves forbidden as an error rather than empty data', () async {
    final gateway = MobileGateway(
      Uri.parse('https://example.test'),
      () async => 'token',
      client: MockClient((_) async => http.Response('{}', 403)),
    );
    gateway.select('user', 'school', 'professor');
    await expectLater(gateway.read('academic'), throwsStateError);
  });
  test('professor cannot request own-student finance endpoint', () async {
    var calls = 0;
    final gateway = MobileGateway(
      Uri.parse('https://example.test'),
      () async => 'token',
      client: MockClient((_) async {
        calls++;
        return http.Response('{}', 200);
      }),
    );
    gateway.select('teacher', 'school', 'professor');
    await expectLater(gateway.read('finance'), throwsStateError);
    expect(calls, 0);
  });
  test('finance response for another user is discarded', () async {
    final gateway = MobileGateway(
      Uri.parse('https://example.test'),
      () async => 'token',
      client: MockClient(
        (_) async => http.Response(
          '{"schoolId":"school","role":"aluno","userId":"other","invoices":[]}',
          200,
        ),
      ),
    );
    gateway.select('student', 'school', 'aluno');
    await expectLater(gateway.read('finance'), throwsStateError);
  });
  test('servidor da API: origem no browser, HTTPS configurado no nativo', () {
    final page = Uri.parse('https://m.portal-siga.com/home');
    expect(resolveApiOrigin('', web: true, base: page), page);
    expect(resolveApiOrigin('', web: false, base: page), isNull);
    expect(
      resolveApiOrigin('https://portal-siga.com/x', web: false, base: page),
      Uri.parse('https://portal-siga.com'),
    );
    expect(
      resolveApiOrigin('http://portal-siga.com', web: false, base: page),
      isNull,
    );
    expect(resolveApiOrigin('nada', web: false, base: page), isNull);
  });
}
