import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:siga_plus_flutter/gateway.dart';

void main() {
  test('does not contact API without a session', () async {
    var calls = 0;
    final gateway = MobileGateway(Uri.parse('https://example.test'), () async => null,
      client: MockClient((_) async { calls++; return http.Response('{}', 200); }));
    await expectLater(gateway.session(), throwsStateError);
    expect(calls, 0);
  });
  test('rejects cross-school response', () async {
    final gateway = MobileGateway(Uri.parse('https://example.test'), () async => 'token',
      client: MockClient((_) async => http.Response('{"schoolId":"other","role":"aluno"}', 200)));
    gateway.select('user', 'school', 'aluno');
    await expectLater(gateway.read('academic'), throwsStateError);
  });
  test('discards outstanding response after school switch', () async {
    final response = Completer<http.Response>();
    final requested = Completer<void>();
    final gateway = MobileGateway(Uri.parse('https://example.test'), () async => 'token',
      client: MockClient((_) { requested.complete(); return response.future; }));
    gateway.select('user', 'school-a', 'aluno');
    final read = gateway.read('academic');
    final assertion = expectLater(read, throwsStateError);
    await requested.future;
    gateway.select('user', 'school-b', 'aluno');
    response.complete(http.Response('{"schoolId":"school-a","role":"aluno"}', 200));
    await assertion;
  });
  test('preserves forbidden as an error rather than empty data', () async {
    final gateway = MobileGateway(Uri.parse('https://example.test'), () async => 'token',
      client: MockClient((_) async => http.Response('{}', 403)));
    gateway.select('user', 'school', 'professor');
    await expectLater(gateway.read('academic'), throwsStateError);
  });
}
