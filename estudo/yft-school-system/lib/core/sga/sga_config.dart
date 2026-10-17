/// Modo SIGA: a app entra com a conta do SIGA (Supabase Auth do projecto das
/// escolas) e lê os dados pela API `/api/sga` do Worker.
///
/// Liga-se na compilação, com valores públicos:
///
/// ```sh
/// flutter build web \
///   --dart-define=SGA_SUPABASE_URL=https://xodgfmxiaunpamctfeea.supabase.co \
///   --dart-define=SGA_SUPABASE_PUBLISHABLE_KEY=sb_publishable_... \
///   --dart-define=HCAPTCHA_SITE_KEY=... \
///   --dart-define=SGA_PORTAL_URL=https://portal-siga.com
/// ```
///
/// Sem estes valores, a app continua no modo Firebase de sempre.
class SgaConfig {
  final String supabaseUrl;
  final String publishableKey;

  /// O Supabase do SIGA tem captcha (hCaptcha) na entrada.
  final String captchaSiteKey;

  /// Endereço do portal do SIGA (ex.: https://portal-siga.com). As escritas
  /// (chamada do professor…) vão para as rotas `/api/mobile/*` do próprio
  /// SIGA, que aplicam as regras e a auditoria do SIGA.
  final String portalUrl;

  const SgaConfig({
    required this.supabaseUrl,
    required this.publishableKey,
    this.captchaSiteKey = '',
    this.portalUrl = '',
  });

  static const fromEnvironment = SgaConfig(
    supabaseUrl: String.fromEnvironment('SGA_SUPABASE_URL'),
    publishableKey: String.fromEnvironment('SGA_SUPABASE_PUBLISHABLE_KEY'),
    captchaSiteKey: String.fromEnvironment('HCAPTCHA_SITE_KEY'),
    portalUrl: String.fromEnvironment('SGA_PORTAL_URL'),
  );

  bool get enabled => supabaseUrl.isNotEmpty && publishableKey.isNotEmpty;
  bool get needsCaptcha => captchaSiteKey.isNotEmpty;
}

/// Ligado nesta compilação?
bool get sgaMode => SgaConfig.fromEnvironment.enabled;
