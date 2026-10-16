import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:yft_school_system/core/sga/sga_auth.dart';
import 'package:yft_school_system/core/sga/sga_config.dart';

/// GoTrue falso: regista os pedidos e responde com o que o teste decidir.
class _Gotrue implements HttpClientAdapter {
  final List<RequestOptions> requests = [];
  final List<Map<String, dynamic>> bodies = [];
  (int, Map<String, dynamic>) Function(RequestOptions, Map<String, dynamic>) reply;
  _Gotrue(this.reply);

  @override
  Future<ResponseBody> fetch(RequestOptions o, Stream<Uint8List>? s, Future<void>? c) async {
    requests.add(o);
    final body = o.data is Map ? Map<String, dynamic>.from(o.data as Map) : <String, dynamic>{};
    bodies.add(body);
    final (status, json) = reply(o, body);
    return ResponseBody.fromString(jsonEncode(json), status,
        headers: {Headers.contentTypeHeader: ['application/json']});
  }

  @override
  void close({bool force = false}) {}
}

class _MemoryStorage implements SgaTokenStorage {
  String? value;
  @override
  Future<String?> read() async => value;
  @override
  Future<void> write(String v) async => value = v;
  @override
  Future<void> delete() async => value = null;
}

const _cfg = SgaConfig(supabaseUrl: 'https://sga.test/', publishableKey: 'sb_publishable_x');

Map<String, dynamic> _tokens(String access, {int expiresIn = 3600}) => {
  'access_token': access,
  'refresh_token': 'r-$access',
  'expires_in': expiresIn,
  'user': {'id': 'u-1'},
};

void main() {
  test('entrar envia e-mail, senha, captcha e a chave publicável', () async {
    final gotrue = _Gotrue((o, b) => (200, _tokens('a1')));
    final client = SgaAuthClient(_cfg, dio: Dio()..httpClientAdapter = gotrue);
    final t = await client.signIn(' pai@ex.ao ', 'segredo', captchaToken: 'cap-1');
    final req = gotrue.requests.single;
    expect(req.uri.toString(), 'https://sga.test/auth/v1/token?grant_type=password');
    expect(req.headers['apikey'], 'sb_publishable_x');
    expect(gotrue.bodies.single, {
      'email': 'pai@ex.ao',
      'password': 'segredo',
      'gotrue_meta_security': {'captcha_token': 'cap-1'},
    });
    expect(t.accessToken, 'a1');
    expect(t.userId, 'u-1');
  });

  test('erros do Supabase em português', () {
    expect(mapAuthError(400, {'error_code': 'invalid_credentials'}).code, 'credentials');
    expect(mapAuthError(400, {'error_code': 'captcha_failed'}).code, 'captcha');
    expect(mapAuthError(400, {'msg': 'captcha protection: request disallowed (no captcha response)'}).code, 'captcha');
    expect(mapAuthError(400, {'error_code': 'email_not_confirmed'}).code, 'unconfirmed');
    expect(mapAuthError(429, {}).code, 'rate');
    expect(mapAuthError(null, null).code, 'network');
    expect(mapAuthError(400, {'error_code': 'refresh_token_not_found'}).code, 'expired');
  });

  test('renova uma só vez antes de expirar e guarda o par novo', () async {
    var n = 0;
    final gotrue = _Gotrue((o, b) {
      n++;
      return (200, _tokens('a${n + 1}'));
    });
    final storage = _MemoryStorage();
    final session = SgaSession(SgaAuthClient(_cfg, dio: Dio()..httpClientAdapter = gotrue), storage);
    // Sessão guardada que expira daqui a 30 s: tem de renovar.
    storage.value = jsonEncode({
      'access_token': 'a1',
      'refresh_token': 'r-a1',
      'expires_at': DateTime.now().add(const Duration(seconds: 30)).toUtc().toIso8601String(),
      'user_id': 'u-1',
      'school_id': 's-2',
    });
    expect(await session.restore(), isTrue);
    expect(session.schoolId, 's-2');
    final results = await Future.wait([session.accessToken(), session.accessToken(), session.accessToken()]);
    expect(results.toSet(), {'a2'});
    expect(gotrue.requests.where((r) => r.uri.query.contains('refresh_token')).length, 1);
    expect(gotrue.bodies.last, {'refresh_token': 'r-a1'});
    expect(jsonDecode(storage.value!)['access_token'], 'a2');
    expect(jsonDecode(storage.value!)['school_id'], 's-2');
  });

  test('renovação recusada termina a sessão; sem rede mantém-na', () async {
    final storage = _MemoryStorage();
    var status = 400;
    final gotrue = _Gotrue((o, b) => (status, {'error_code': 'refresh_token_not_found'}));
    final dio = Dio()..httpClientAdapter = gotrue;
    final session = SgaSession(SgaAuthClient(_cfg, dio: dio), storage);
    void seed() => storage.value = jsonEncode({
      'access_token': 'old',
      'refresh_token': 'r-old',
      'expires_at': DateTime.now().subtract(const Duration(minutes: 1)).toUtc().toIso8601String(),
      'user_id': 'u-1',
    });
    seed();
    expect(await session.restore(), isFalse);
    expect(session.signedIn, isFalse);
    expect(storage.value, isNull);

    // Sem rede: o pedido falha sem resposta; a sessão fica para depois.
    seed();
    final offline = SgaSession(
      SgaAuthClient(_cfg, dio: Dio()..httpClientAdapter = _Offline()),
      storage,
    );
    expect(await offline.restore(), isFalse);
    expect(offline.signedIn, isTrue);
    expect(storage.value, isNotNull);
  });

  test('sair apaga a sessão do aparelho e avisa o servidor', () async {
    final gotrue = _Gotrue((o, b) => (200, o.path.endsWith('/logout') ? {} : _tokens('a1')));
    final storage = _MemoryStorage();
    final session = SgaSession(SgaAuthClient(_cfg, dio: Dio()..httpClientAdapter = gotrue), storage);
    await session.signIn('pai@ex.ao', 'x');
    expect(storage.value, isNotNull);
    await session.signOut();
    expect(session.signedIn, isFalse);
    expect(storage.value, isNull);
    final logout = gotrue.requests.last;
    expect(logout.uri.path, '/auth/v1/logout');
    expect(logout.headers['Authorization'], 'Bearer a1');
  });
}

class _Offline implements HttpClientAdapter {
  @override
  Future<ResponseBody> fetch(RequestOptions o, Stream<Uint8List>? s, Future<void>? c) =>
      throw DioException.connectionError(requestOptions: o, reason: 'offline');
  @override
  void close({bool force = false}) {}
}
