import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:yft_school_system/core/sga/sga_auth.dart';
import 'package:yft_school_system/core/sga/sga_config.dart';

/// A app e a verificação em segundo plano (outro isolate) partilham a sessão
/// guardada. O Supabase troca o token de renovação a cada uso: quem renovar
/// depois do outro tem de usar o par novo, ou a pessoa sai da conta.

class _Gotrue implements HttpClientAdapter {
  final List<Map<String, dynamic>> bodies = [];
  (int, Map<String, dynamic>) Function(Map<String, dynamic> body) reply;
  _Gotrue(this.reply);

  @override
  Future<ResponseBody> fetch(
    RequestOptions o,
    Stream<Uint8List>? s,
    Future<void>? c,
  ) async {
    final body = Map<String, dynamic>.from(o.data as Map);
    bodies.add(body);
    final (status, json) = reply(body);
    return ResponseBody.fromString(
      jsonEncode(json),
      status,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

class _Storage implements SgaTokenStorage {
  String? value;
  @override
  Future<String?> read() async => value;
  @override
  Future<void> write(String v) async => value = v;
  @override
  Future<void> delete() async => value = null;
}

const _cfg = SgaConfig(
  supabaseUrl: 'https://sga.test',
  publishableKey: 'sb_publishable_x',
);

String _saved(String access, Duration expiresIn) => jsonEncode({
  'access_token': access,
  'refresh_token': 'r-$access',
  'expires_at': DateTime.now().add(expiresIn).toUtc().toIso8601String(),
  'user_id': 'u-1',
  'school_id': 's-1',
});

Map<String, dynamic> _fresh(String access) => {
  'access_token': access,
  'refresh_token': 'r-$access',
  'expires_in': 3600,
  'user': {'id': 'u-1'},
};

void main() {
  test('o outro isolate já renovou: usa o par dele, sem pedir nada', () async {
    final storage = _Storage();
    // A entrada devolve um token que expira daqui a 30 s.
    final gotrue = _Gotrue(
      (body) => body.containsKey('password')
          ? (200, {..._fresh('a1'), 'expires_in': 30})
          : (200, _fresh('nunca')),
    );
    final session = SgaSession(
      SgaAuthClient(_cfg, dio: Dio()..httpClientAdapter = gotrue),
      storage,
    );
    await session.signIn('aluno@ex.ao', 'segredo');
    expect(jsonDecode(storage.value!)['access_token'], 'a1');

    // Entretanto, a verificação em segundo plano renovou e guardou o par novo.
    storage.value = _saved('a2', const Duration(minutes: 50));

    expect(await session.accessToken(), 'a2');
    expect(gotrue.bodies, hasLength(1)); // só a entrada
    expect(session.signedIn, isTrue);
  });

  test(
    'recusado por ter sido gasto pelo outro isolate: segue com o par novo',
    () async {
      final storage = _Storage()
        ..value = _saved('a1', const Duration(seconds: 20));
      late SgaSession session;
      final gotrue = _Gotrue((body) {
        // O outro isolate gastou o token a1 mesmo agora e guardou o a2.
        storage.value = _saved('a2', const Duration(minutes: 55));
        return (400, {'error_code': 'refresh_token_already_used'});
      });
      session = SgaSession(
        SgaAuthClient(_cfg, dio: Dio()..httpClientAdapter = gotrue),
        storage,
      );
      expect(await session.restore(), isTrue);
      expect(await session.accessToken(), 'a2');
      expect(session.signedIn, isTrue);
      expect(gotrue.bodies.single, {'refresh_token': 'r-a1'});
    },
  );

  test('recusado de verdade (ninguém renovou): a sessão acaba', () async {
    final storage = _Storage()
      ..value = _saved('a1', const Duration(seconds: 20));
    var cleared = 0;
    final session = SgaSession(
      SgaAuthClient(
        _cfg,
        dio: Dio()
          ..httpClientAdapter = _Gotrue(
            (_) => (400, {'error_code': 'refresh_token_not_found'}),
          ),
      ),
      storage,
    )..onClear = () async => cleared++;
    expect(await session.restore(), isFalse);
    expect(session.signedIn, isFalse);
    expect(storage.value, isNull);
    expect(cleared, 1);
  });

  test('outra conta guardada entretanto não é adoptada', () async {
    final storage = _Storage()
      ..value = _saved('a1', const Duration(seconds: 20));
    final gotrue = _Gotrue((_) => (200, _fresh('a3')));
    final session = SgaSession(
      SgaAuthClient(_cfg, dio: Dio()..httpClientAdapter = gotrue),
      storage,
    );
    // Antes de renovar, aparece no armazenamento a sessão de outra pessoa.
    final other = jsonDecode(_saved('x9', const Duration(minutes: 50)))
      ..['user_id'] = 'u-2';
    final restore = session.restore();
    storage.value = jsonEncode(other);
    expect(await restore, isTrue);
    expect(await session.accessToken(), 'a3');
    expect(gotrue.bodies.single, {'refresh_token': 'r-a1'});
  });
}
