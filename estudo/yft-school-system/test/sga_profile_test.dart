import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:yft_school_system/core/sga/sga_attendance.dart' show SgaRejected;
import 'package:yft_school_system/core/sga/sga_profile.dart';

class _Portal implements HttpClientAdapter {
  final List<RequestOptions> requests = [];
  (int, Object) Function(RequestOptions) reply;
  _Portal(this.reply);
  @override
  Future<ResponseBody> fetch(RequestOptions o, Stream<Uint8List>? s, Future<void>? c) async {
    requests.add(o);
    final (status, body) = reply(o);
    return ResponseBody.fromString(jsonEncode(body), status, headers: {Headers.contentTypeHeader: ['application/json']});
  }

  @override
  void close({bool force = false}) {}
}

SgaProfileRepository _repo(_Portal p) =>
    SgaProfileRepository(Dio(BaseOptions(baseUrl: 'https://portal.test'))..httpClientAdapter = p);

void main() {
  test('lê o perfil e grava com a versão; telefone vazio vai como null', () async {
    final portal = _Portal((o) => o.method == 'GET'
        ? (200, {'full_name': 'Mariana Silva', 'phone': '+244923000000', 'updated_at': 'v1', 'school_name': 'Escola Um'})
        : (200, {'full_name': 'Mariana S.', 'updated_at': 'v2'}));
    final repo = _repo(portal);
    final p = await repo.load();
    expect((p.fullName, p.phone, p.updatedAt, p.schoolName), ('Mariana Silva', '+244923000000', 'v1', 'Escola Um'));
    await repo.save(fullName: 'Mariana S.', phone: '', expectedUpdatedAt: 'v1');
    expect(portal.requests.last.uri.path, '/api/mobile/profile');
    expect(portal.requests.last.data, {'full_name': 'Mariana S.', 'phone': null, 'expected_updated_at': 'v1'});
  });

  test('recusas com o texto do SIGA', () async {
    Future<String> fail(int status, Object body) async {
      try {
        await _repo(_Portal((o) => (status, body))).save(fullName: 'X Y', phone: '1', expectedUpdatedAt: 'v');
        return 'ok';
      } on SgaRejected catch (e) {
        return e.message;
      }
    }

    expect(await fail(422, {'error': 'INVALID_INPUT', 'message': 'Telefone inválido. Use +244 9XX XXX XXX.'}),
        'Telefone inválido. Use +244 9XX XXX XXX.');
    expect(await fail(422, {'error': 'INVALID_INPUT'}), 'Verifique o nome e o telefone.');
    expect(await fail(400, {'error': 'REJECTED', 'message': 'O perfil foi alterado noutro dispositivo.'}),
        'O perfil foi alterado noutro dispositivo.');
  });
}
