import 'gateway.dart' show resolveApiOrigin;

/// Configuração pública da app, lida do `.env` na compilação
/// (`flutter build … --dart-define-from-file=.env`).
///
/// Tudo o que está aqui fica dentro do APK e pode ser extraído por qualquer
/// pessoa: só valores públicos. Senhas da base de dados, a chave
/// `service_role`/`sb_secret_` e credenciais do Gmail/SMTP ficam no servidor.
class AppConfig {
  const AppConfig({
    required this.supabaseUrl,
    required this.publishableKey,
    required this.apiOrigin,
    required this.googleLogin,
    required this.authRedirect,
    this.microsoftLogin = false,
    this.appleLogin = false,
    this.portalUrl,
  });

  /// Portal SIGA Plus web, para o trabalho que não se faz na app (lançar
  /// notas, editar planos, pedidos…). Só HTTPS; sem valor, a app explica
  /// sem botão.
  final Uri? portalUrl;

  final String supabaseUrl;
  final String publishableKey;
  final Uri? apiOrigin;
  final bool googleLogin;
  final bool microsoftLogin;
  final bool appleLogin;

  /// Para onde o Google devolve o utilizador depois de entrar. No Android é o
  /// esquema da app (declarado no AndroidManifest); no browser, a página.
  final String authRedirect;

  static const defaultAuthRedirect = 'ao.portalsiga.sigaplus://login-callback';

  factory AppConfig.fromValues({
    required String supabaseUrl,
    required String publishableKey,
    required String apiOrigin,
    required String googleLogin,
    required String authRedirect,
    required bool web,
    required Uri base,
    String microsoftLogin = '',
    String appleLogin = '',
    String portalUrl = '',
  }) => AppConfig(
    portalUrl: switch (Uri.tryParse(portalUrl.trim())) {
      final Uri uri when uri.scheme == 'https' && uri.host.isNotEmpty => uri,
      _ => null,
    },
    supabaseUrl: supabaseUrl.trim(),
    publishableKey: publishableKey.trim(),
    apiOrigin: resolveApiOrigin(apiOrigin.trim(), web: web, base: base),
    googleLogin: googleLogin.trim().toLowerCase() == 'true',
    microsoftLogin: microsoftLogin.trim().toLowerCase() == 'true',
    appleLogin: appleLogin.trim().toLowerCase() == 'true',
    authRedirect: web
        ? '${base.scheme}://${base.authority}/'
        : (authRedirect.trim().isEmpty
              ? defaultAuthRedirect
              : authRedirect.trim()),
  );

  factory AppConfig.fromEnvironment({required bool web, required Uri base}) =>
      AppConfig.fromValues(
        supabaseUrl: const String.fromEnvironment('SUPABASE_URL'),
        publishableKey: const String.fromEnvironment(
          'SUPABASE_PUBLISHABLE_KEY',
        ),
        apiOrigin: const String.fromEnvironment('SIGA_API_ORIGIN'),
        googleLogin: const String.fromEnvironment('SIGA_GOOGLE_LOGIN'),
        authRedirect: const String.fromEnvironment('SIGA_AUTH_REDIRECT'),
        microsoftLogin: const String.fromEnvironment('SIGA_MICROSOFT_LOGIN'),
        appleLogin: const String.fromEnvironment('SIGA_APPLE_LOGIN'),
        portalUrl: const String.fromEnvironment('SIGA_PORTAL_URL'),
        web: web,
        base: base,
      );

  /// O que falta para a app funcionar; vazio quando está tudo certo.
  List<String> get problems => [
    if (Uri.tryParse(supabaseUrl)?.scheme != 'https')
      'SUPABASE_URL (https://…)',
    if (!publishableKey.startsWith('sb_publishable_'))
      'SUPABASE_PUBLISHABLE_KEY (sb_publishable_…)',
    if (apiOrigin == null) 'SIGA_API_ORIGIN (https://…)',
  ];
}
