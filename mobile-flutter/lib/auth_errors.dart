/// Mensagens de recusa do Supabase Auth.
///
/// O projecto tem `security_captcha_enabled` com hCaptcha: o `/auth/v1/token`
/// recusa **antes** de olhar para as credenciais quando o pedido não traz
/// `captcha_token`. Sem distinguir esse caso, a recusa aparecia como dados
/// errados — foi assim que a captcha se disfarçou de senha errada no portal.
/// As mensagens acompanham mapSignInError em src/components/auth/AuthGate.tsx.
library;

String authErrorMessage(Object error, {required bool captchaConfigured}) {
  final value = _signal(error);
  if (value.contains('captcha')) {
    return captchaConfigured
        ? 'Confirme que não é um robô e tente novamente.'
        : 'A verificação anti-robô está activa no servidor mas não está '
              'configurada nesta aplicação. Avise a administração: falta '
              'HCAPTCHA_SITE_KEY.';
  }
  if (value.contains('invalid login credentials') ||
      value.contains('invalid_credentials') ||
      value.contains('invalid_grant')) {
    return 'E-mail ou senha incorrectos. Confirme os dados e tente novamente.';
  }
  if (value.contains('email not confirmed') ||
      value.contains('email_not_confirmed')) {
    return 'Confirme o e-mail da conta antes de iniciar sessão.';
  }
  if (value.contains('invalid_totp') ||
      value.contains('invalid mfa') ||
      value.contains('mfa_verification_failed')) {
    return 'Código de autenticação inválido ou expirado. Peça um novo código '
        'à aplicação de autenticação.';
  }
  if (value.contains('too many requests') ||
      value.contains('rate limit') ||
      value.contains('rate_limited') ||
      value.contains('over_request_rate_limit') ||
      value.contains('429')) {
    return 'Demasiadas tentativas. Aguarde um momento e tente outra vez.';
  }
  if (value.contains('network') ||
      value.contains('fetch') ||
      value.contains('socket') ||
      value.contains('timeout')) {
    return 'Não foi possível contactar o serviço de autenticação.';
  }
  return 'Não foi possível iniciar sessão. Tente novamente.';
}

/// O código do Auth é mais fiável do que a frase; a frase cobre o resto.
String _signal(Object error) {
  final code = _codeOf(error);
  return '${code ?? ''} ${error.toString()}'.toLowerCase();
}

String? _codeOf(Object error) {
  try {
    final dynamic candidate = error;
    final code = candidate.code;
    return code is String ? code : null;
  } catch (_) {
    return null;
  }
}
