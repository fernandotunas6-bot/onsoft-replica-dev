import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:yft_school_system/core/sga/sga_attendance.dart';

class _Portal implements HttpClientAdapter {
  final List<RequestOptions> requests = [];
  (int, Object) Function(RequestOptions) reply;
  _Portal(this.reply);

  @override
  Future<ResponseBody> fetch(RequestOptions o, Stream<Uint8List>? s, Future<void>? c) async {
    requests.add(o);
    final (status, body) = reply(o);
    return ResponseBody.fromString(jsonEncode(body), status,
        headers: {Headers.contentTypeHeader: ['application/json']});
  }

  @override
  void close({bool force = false}) {}
}

SgaAttendanceRepository _repo(_Portal p) =>
    SgaAttendanceRepository(Dio(BaseOptions(baseUrl: 'https://portal.test'))..httpClientAdapter = p);

void main() {
  test('aulas do dia e folha de chamada com os campos do SIGA', () async {
    final portal = _Portal((o) => o.queryParameters.containsKey('session_id')
        ? (200, {
            'session': {'id': 's1', 'class_group_name': '10.ª A', 'subject_name': 'Matemática', 'starts_at': '07:30:00', 'ends_at': '08:15:00', 'status': 'completed'},
            'students': [
              {'student_id': 'a', 'full_name': 'Ana', 'status': 'absent'},
              {'student_id': 'b', 'full_name': 'Bruno', 'status': 'not_registered'},
            ],
          })
        : (200, {
            'date': '2026-10-16',
            'sessions': [
              {'id': 's1', 'class_group_name': '10.ª A', 'subject_name': 'Matemática', 'starts_at': '07:30:00', 'ends_at': '08:15:00', 'room': 'Sala 3', 'status': 'pending'},
            ],
          }));
    final repo = _repo(portal);
    final day = await repo.lessons('2026-10-16');
    expect(portal.requests.first.uri.toString(), 'https://portal.test/api/mobile/attendance?date=2026-10-16');
    expect(day.lessons.single.startsAt, '07:30');
    expect(day.lessons.single.done, isFalse);
    final sheet = await repo.sheet('s1');
    expect(sheet.lesson.done, isTrue);
    expect(sheet.students.map((s) => s.status), ['absent', 'not_registered']);
  });

  test('gravar envia os estados; corrigir leva o motivo', () async {
    final portal = _Portal((o) => (200, {'ok': true}));
    final repo = _repo(portal);
    await repo.save('s1', {'a': 'absent', 'b': 'present'});
    await repo.save('s1', {'a': 'present'}, reason: 'Engano na chamada');
    expect(portal.requests[0].data, {
      'session_id': 's1',
      'records': [
        {'student_id': 'a', 'status': 'absent'},
        {'student_id': 'b', 'status': 'present'},
      ],
    });
    expect((portal.requests[1].data as Map)['reason'], 'Engano na chamada');
  });

  test('recusas do SIGA com o texto do SIGA', () async {
    Future<String> fail(int status, Object body) async {
      try {
        await _repo(_Portal((o) => (status, body))).save('s1', {});
        return 'ok';
      } on SgaRejected catch (e) {
        return e.message;
      }
    }

    expect(await fail(400, {'error': 'REJECTED', 'message': 'A pauta deste período já é oficial.'}),
        'A pauta deste período já é oficial.');
    expect(await fail(403, {'error': 'MFA_REQUIRED', 'message': 'Esta conta exige verificação em dois passos.'}),
        'Esta conta exige verificação em dois passos.');
    expect(await fail(401, {'error': 'SESSION_INVALID'}), 'A sessão terminou. Entre de novo.');
    expect(await fail(500, {'error': 'FAILURE'}), 'O SIGA não respondeu. Tente mais tarde.');
  });
}
