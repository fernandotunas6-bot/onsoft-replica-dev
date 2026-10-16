/// Modo SIGA: a app entra com a conta do SIGA (Supabase Auth do projecto das
/// escolas) e lê os dados pela API `/api/sga` do Worker.
///
/// Liga-se na compilação, com valores públicos:
///
/// ```sh
/// flutter build web \
///   --dart-define=SGA_SUPABASE_URL=https://xodgfmxiaunpamctfeea.supabase.co \
///   --dart-define=SGA_SUPABASE_PUBLISHABLE_KEY=sb_publishable_... \
///   --dart-define=HCAPTCHA_SITE_KEY=...
/// ```
///
/// Sem estes valores, a app continua no modo Firebase de sempre.
class SgaConfig {
  final String supabaseUrl;
  final String publishableKey;

  /// O Supabase do SIGA tem captcha (hCaptcha) na entrada.
  final String captchaSiteKey;

  const SgaConfig({
    required this.supabaseUrl,
    required this.publishableKey,
    this.captchaSiteKey = '',
  });

  static const fromEnvironment = SgaConfig(
    supabaseUrl: String.fromEnvironment('SGA_SUPABASE_URL'),
    publishableKey: String.fromEnvironment('SGA_SUPABASE_PUBLISHABLE_KEY'),
    captchaSiteKey: String.fromEnvironment('HCAPTCHA_SITE_KEY'),
  );

  bool get enabled => supabaseUrl.isNotEmpty && publishableKey.isNotEmpty;
  bool get needsCaptcha => captchaSiteKey.isNotEmpty;
}

/// Ligado nesta compilação?
bool get sgaMode => SgaConfig.fromEnvironment.enabled;
