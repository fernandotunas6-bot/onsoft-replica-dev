import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:siga_plus_flutter/presence.dart';

const school = '11111111-2222-4333-8444-555555555555';
const token = 'SIGAP1.$school.R.59000000.abcdefghijklmnopqrstuv';

PendingScan scan([String opId = 'op-1']) => PendingScan(
  opId: opId,
  schoolId: school,
  token: token,
  deviceScannedAt: DateTime.utc(2026, 10, 26, 7),
  latitude: -8.83,
  longitude: 13.23,
  accuracy: 20,
);

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('reconhece só o QR de presença do SIGA', () {
    expect(isSchoolQr(token), isTrue);
    expect(isSchoolQr('https://exemplo.ao'), isFalse);
    expect(isSchoolQr('SIGAP1.curto'), isFalse);
    expect(isSchoolQr(null), isFalse);
  });

  test('id do envio é um UUID v4', () {
    expect(
      RegExp(
        r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
      ).hasMatch(newOpId()),
      isTrue,
    );
  });

  test('a fila sem rede guarda, não duplica e remove', () async {
    final queue = PresenceQueue(await SharedPreferences.getInstance());
    await queue.add(scan('a'));
    await queue.add(scan('a'));
    await queue.add(scan('b'));
    expect(queue.read().map((s) => s.opId), ['a', 'b']);
    await queue.remove('a');
    expect(queue.read().single.opId, 'b');
    expect(queue.read().single.deviceScannedAt, DateTime.utc(2026, 10, 26, 7));
  });

  test('sem rede: a fila fica para depois; recusa sai da fila', () async {
    final queue = PresenceQueue(await SharedPreferences.getInstance());
    await queue.add(scan('rede'));
    final offlineApi = PresenceApi(
      Uri.parse('https://exemplo.test'),
      () async => 'token',
      client: MockClient((_) async => throw http.ClientException('offline')),
    );
    var result = await flushPresenceQueue(offlineApi, queue);
    expect(result.sent, 0);
    expect(queue.read(), hasLength(1));

    final refusingApi = PresenceApi(
      Uri.parse('https://exemplo.test'),
      () async => 'token',
      client: MockClient(
        (_) async => http.Response('{"error":"QR anulado"}', 422),
      ),
    );
    result = await flushPresenceQueue(refusingApi, queue);
    expect(result.refused, ['QR anulado']);
    expect(queue.read(), isEmpty);
  });

  test(
    'envia a leitura guardada como offline, com a hora do telemóvel',
    () async {
      final queue = PresenceQueue(await SharedPreferences.getInstance());
      await queue.add(scan());
      Map<String, dynamic>? body;
      final api = PresenceApi(
        Uri.parse('https://exemplo.test'),
        () async => 'token',
        client: MockClient((request) async {
          body = jsonDecode(request.body) as Map<String, dynamic>;
          expect(request.headers['Authorization'], 'Bearer token');
          return http.Response(
            jsonEncode({
              'decision': 'accepted',
              'message': 'Presença confirmada',
              'lessons': [
                {'label': '10.ª A · Matemática'},
              ],
            }),
            200,
          );
        }),
      );
      final result = await flushPresenceQueue(api, queue);
      expect(result.sent, 1);
      expect(body!['offline'], isTrue);
      expect(body!['schoolId'], school);
      expect(body!['deviceScannedAt'], '2026-10-26T07:00:00.000Z');
      expect(body!['deviceNow'], isA<String>());
      expect(queue.read(), isEmpty);
    },
  );

  test('aulas de hoje e modo da escola', () async {
    final api = PresenceApi(
      Uri.parse('https://exemplo.test'),
      () async => 'token',
      client: MockClient(
        (_) async => http.Response(
          jsonEncode({
            'schoolId': school,
            'mode': 'qr',
            'date': '2026-10-26',
            'serverNow': DateTime.now().millisecondsSinceEpoch,
            'lessons': [
              {
                'sessionId': 's1',
                'classGroupName': '10.ª A',
                'subjectName': 'Matemática',
                'startsAt': '07:30:00',
                'endsAt': '08:15:00',
                'status': 'pending',
                'presence': {
                  'teacher_checked_in_at': '2026-10-26T06:31:00Z',
                  'teacher_late_minutes': 1,
                },
              },
            ],
          }),
          200,
        ),
      ),
    );
    final today = await api.today(school);
    expect(today.mode, PresenceMode.qr);
    expect(today.lessons.single.confirmed, isTrue);
    expect(today.lessons.single.timeRange, '07:30–08:15');
    expect(today.clockOffset.inSeconds.abs(), lessThan(5));
  });

  test('recusa resposta de outra escola', () async {
    final api = PresenceApi(
      Uri.parse('https://exemplo.test'),
      () async => 'token',
      client: MockClient(
        (_) async => http.Response('{"schoolId":"outra","lessons":[]}', 200),
      ),
    );
    await expectLater(api.today(school), throwsA(isA<PresenceFailure>()));
  });
}
