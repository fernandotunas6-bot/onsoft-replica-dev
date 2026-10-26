import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:yft_school_system/core/sga/sga_attendance.dart' show SgaRejected;
import 'package:yft_school_system/core/sga/sga_grades.dart';

class _Server implements HttpClientAdapter {
  final List<RequestOptions> requests = [];
  (int, Object) Function(RequestOptions) reply;
  _Server(this.reply);

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

Dio _dio(String base, _Server s) => Dio(BaseOptions(baseUrl: base))..httpClientAdapter = s;

void main() {
  test('MT como o SIGA: (MAC + NPT) / 2 à décima; só uma, vale essa', () {
    expect(trimesterAverage(12.5, 14), 13.3);
    expect(trimesterAverage(10.45, 10.45), 10.5);
    expect(trimesterAverage(11, null), 11);
    expect(trimesterAverage(null, 9), 9);
    expect(trimesterAverage(null, null), isNull);
  });

  test('lê no Worker e grava no SIGA, em lotes de 80', () async {
    final worker = _Server((o) => o.path.endsWith('/classes')
        ? (200, {'data': [{'class_group_id': 'cg', 'class_name': '10.ª A', 'subject_id': 'sub', 'subject_name': 'Matemática'}]})
        : (200, {'term': 1, 'provisional': false, 'students': [{'enrollment_id': 'e1', 'name': 'Ana', 'mac': 12.5, 'npp': 9, 'npt': 14}]}));
    final portal = _Server((o) => (200, {'saved': 1}));
    final repo = SgaGradesRepository(_dio('https://worker.test', worker), _dio('https://portal.test', portal));
    final a = (await repo.assignments()).single;
    final sheet = await repo.sheet(a, 1);
    expect(worker.requests.last.uri.toString(),
        'https://worker.test/api/sga/teacher/grades?class_group_id=cg&subject_id=sub&term=1');
    expect(sheet.provisional, isFalse);
    expect(sheet.students.single.npt, 14);

    final rows = [for (var i = 0; i < 81; i++) (enrollmentId: 'e$i', mac: 10.0, npp: 10.0, npt: 10.0)];
    await repo.save('sub', 2, rows);
    expect(portal.requests.length, 2);
    expect(portal.requests.first.uri.toString(), 'https://portal.test/api/mobile/grades');
    expect((portal.requests.first.data as Map)['rows'], hasLength(80));
    expect((portal.requests.last.data as Map)['rows'], hasLength(1));
    expect((portal.requests.last.data as Map)['term'], 2);
  });

  test('recusas com o texto do SIGA', () async {
    Future<String> fail(int status, Object body) async {
      final repo = SgaGradesRepository(_dio('https://w', _Server((o) => (status, body))), _dio('https://p', _Server((o) => (status, body))));
      try {
        await repo.save('s', 1, [(enrollmentId: 'e', mac: 1.0, npp: 1.0, npt: 1.0)]);
        return 'ok';
      } on SgaRejected catch (e) {
        return e.message;
      }
    }

    expect(await fail(400, {'error': 'REJECTED', 'message': 'O 2º trimestre/período ainda não está configurado.'}),
        'O 2º trimestre/período ainda não está configurado.');
    expect(await fail(404, {'error': 'CLASS_SUBJECT_NOT_FOUND'}), 'Esta disciplina não é sua nesta turma.');
    expect(await fail(422, {'error': 'INVALID_INPUT'}), 'Verifique as notas: têm de estar entre 0 e 20.');
  });
}
