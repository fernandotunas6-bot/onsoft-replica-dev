import 'package:flutter_test/flutter_test.dart';
import 'package:siga_plus_flutter/auth_errors.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

void main() {
  test('captcha refusal is not reported as wrong credentials', () {
    final failure = AuthException('captcha protection: request disallowed');
    expect(
      authErrorMessage(failure, captchaConfigured: true),
      'Confirme que não é um robô e tente novamente.',
    );
    expect(
      authErrorMessage(failure, captchaConfigured: false),
      contains('HCAPTCHA_SITE_KEY'),
    );
  });

  test('the Auth code decides before the sentence', () {
    final failure = AuthApiException(
      'Request failed',
      code: 'invalid_credentials',
    );
    expect(
      authErrorMessage(failure, captchaConfigured: true),
      startsWith('E-mail ou senha incorrectos'),
    );
  });

  test('rate limit and unconfirmed email keep their own message', () {
    expect(
      authErrorMessage(
        AuthException('Too many requests'),
        captchaConfigured: true,
      ),
      startsWith('Demasiadas tentativas'),
    );
    expect(
      authErrorMessage(
        AuthApiException('refused', code: 'email_not_confirmed'),
        captchaConfigured: true,
      ),
      startsWith('Confirme o e-mail'),
    );
  });

  test('an unknown refusal does not accuse the password', () {
    final message = authErrorMessage(
      StateError('conta suspensa pela escola'),
      captchaConfigured: true,
    );
    expect(message, 'Não foi possível iniciar sessão. Tente novamente.');
  });
}
