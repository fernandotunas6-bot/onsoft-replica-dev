import 'dart:convert';
import 'package:http/http.dart' as http;

/// Entrada por B.I., telefone ou e-mail, decidida pelo servidor.
///
/// O identificador é resolvido em `backend/identity.ts`, que espelha o
/// `signInWithIdentifierFn` do portal: o e-mail resolvido nunca volta ao
/// dispositivo e um identificador desconhecido responde como uma senha errada.
/// Só a sessão volta, e é instalada pelo SDK a partir do refresh token.
class IdentitySignInFailure implements Exception {
  const IdentitySignInFailure(this.code);

  /// Código no vocabulário do Auth, para reusar authErrorMessage.
  final String code;
  @override
  String toString() => code;
}

/// Mapa dos códigos do endpoint para o vocabulário do Auth.
const _codes = <String, String>{
  'INVALID_CREDENTIALS': 'invalid_credentials',
  'CAPTCHA_REQUIRED': 'captcha_failed',
  'EMAIL_NOT_CONFIRMED': 'email_not_confirmed',
  'RATE_LIMITED': 'rate_limited',
  'SERVICE_UNAVAILABLE': 'network',
  'ORIGIN_FORBIDDEN': 'network',
  'NOT_FOUND': 'network',
};

class IdentityLogin {
  IdentityLogin(this.origin, {http.Client? client})
    : client = client ?? http.Client();
  final Uri origin;
  final http.Client client;

  /// Devolve o refresh token da sessão criada pelo servidor.
  Future<String> refreshToken({
    required String identifier,
    required String password,
    String? captchaToken,
  }) async {
    final http.Response response;
    try {
      response = await client
          .post(
            origin.resolve('/api/mobile-v4/auth/identifier'),
            headers: const {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'Cache-Control': 'no-store',
            },
            body: jsonEncode({
              'identifier': identifier,
              'password': password,
              'captchaToken': ?captchaToken,
            }),
          )
          .timeout(const Duration(seconds: 20));
    } catch (_) {
      throw const IdentitySignInFailure('network');
    }
    final body = _decode(response.body);
    if (response.statusCode != 200) {
      final code = body?['error'];
      throw IdentitySignInFailure(
        code is String ? (_codes[code] ?? 'unavailable') : 'unavailable',
      );
    }
    final token = body?['refreshToken'];
    // Uma resposta 200 sem sessão utilizável não é uma entrada: não se deixa
    // a aplicação seguir como se a pessoa tivesse entrado.
    if (body?['version'] != 1 || token is! String || token.isEmpty) {
      throw const IdentitySignInFailure('unavailable');
    }
    return token;
  }

  Map<String, dynamic>? _decode(String body) {
    try {
      final decoded = jsonDecode(body);
      return decoded is Map<String, dynamic> ? decoded : null;
    } catch (_) {
      return null;
    }
  }

  void dispose() => client.close();
}
