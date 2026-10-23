import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:siga_plus_flutter/auth_errors.dart';
import 'package:siga_plus_flutter/identity_login.dart';

http.Client responding(
  int status,
  Object body, {
  void Function(http.Request)? onRequest,
}) => _Fake(status, body, onRequest);

class _Fake extends http.BaseClient {
  _Fake(this.status, this.body, this.onRequest);
  final int status;
  final Object body;
  final void Function(http.Request)? onRequest;
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    onRequest?.call(request as http.Request);
    final text = body is String ? body as String : jsonEncode(body);
    return http.StreamedResponse(
      Stream.value(utf8.encode(text)),
      status,
      request: request,
    );
  }
}

void main() {
  test(
    'sends the identifier and the signal to the institutional endpoint',
    () async {
      http.Request? seen;
      final login = IdentityLogin(
        Uri.parse('https://m.portal-siga.com/'),
        client: responding(200, {
          'version': 1,
          'accessToken': 'access',
          'refreshToken': 'refresh',
        }, onRequest: (request) => seen = request),
      );
      final token = await login.refreshToken(
        identifier: '003456789LA042',
        password: 'senha',
        captchaToken: 'sinal',
      );
      expect(token, 'refresh');
      expect(
        seen!.url.toString(),
        'https://m.portal-siga.com/api/mobile-v4/auth/identifier',
      );
      expect(seen!.method, 'POST');
      expect(jsonDecode(seen!.body), {
        'identifier': '003456789LA042',
        'password': 'senha',
        'captchaToken': 'sinal',
      });
    },
  );

  test('omits the signal when there is none', () async {
    http.Request? seen;
    final login = IdentityLogin(
      Uri.parse('https://m.portal-siga.com/'),
      client: responding(200, {
        'version': 1,
        'accessToken': 'a',
        'refreshToken': 'r',
      }, onRequest: (request) => seen = request),
    );
    await login.refreshToken(identifier: 'aluno@escola.ao', password: 'senha');
    expect(jsonDecode(seen!.body), isNot(contains('captchaToken')));
  });

  test('a captcha refusal keeps its own message', () async {
    final login = IdentityLogin(
      Uri.parse('https://m.portal-siga.com/'),
      client: responding(401, {'error': 'CAPTCHA_REQUIRED'}),
    );
    await expectLater(
      login.refreshToken(identifier: '003456789LA042', password: 'senha'),
      throwsA(
        isA<IdentitySignInFailure>().having(
          (failure) => authErrorMessage(failure, captchaConfigured: true),
          'mensagem',
          'Confirme que não é um robô e tente novamente.',
        ),
      ),
    );
  });

  test('wrong credentials do not become a generic failure', () async {
    final login = IdentityLogin(
      Uri.parse('https://m.portal-siga.com/'),
      client: responding(401, {'error': 'INVALID_CREDENTIALS'}),
    );
    await expectLater(
      login.refreshToken(identifier: '003456789LA042', password: 'senha'),
      throwsA(
        isA<IdentitySignInFailure>().having(
          (failure) => authErrorMessage(failure, captchaConfigured: true),
          'mensagem',
          startsWith('E-mail ou senha incorrectos'),
        ),
      ),
    );
  });

  test('a 200 without a usable session is not a sign-in', () async {
    for (final body in <Object>[
      {'version': 1, 'accessToken': 'access'},
      {'version': 2, 'refreshToken': 'refresh'},
      {'version': 1, 'refreshToken': ''},
      'não é json',
    ]) {
      final login = IdentityLogin(
        Uri.parse('https://m.portal-siga.com/'),
        client: responding(200, body),
      );
      await expectLater(
        login.refreshToken(identifier: '003456789LA042', password: 'senha'),
        throwsA(isA<IdentitySignInFailure>()),
      );
    }
  });

  test('a 404 from an unmounted endpoint is a service failure', () async {
    final login = IdentityLogin(
      Uri.parse('https://m.portal-siga.com/'),
      client: responding(404, {'error': 'NOT_FOUND'}),
    );
    await expectLater(
      login.refreshToken(identifier: '003456789LA042', password: 'senha'),
      throwsA(
        isA<IdentitySignInFailure>().having(
          (failure) => authErrorMessage(failure, captchaConfigured: true),
          'mensagem',
          'Não foi possível contactar o serviço de autenticação.',
        ),
      ),
    );
  });
}
