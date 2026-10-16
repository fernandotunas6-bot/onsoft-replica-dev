import 'package:flutter/widgets.dart';

import 'captcha_box_stub.dart' if (dart.library.js_interop) 'captcha_box_web.dart' as impl;

/// O desafio hCaptcha que o Supabase do SIGA exige para entrar. Chama
/// [onToken] com o token resolvido, ou com null quando expira.
///
/// Na web usa o widget oficial do hCaptcha. Nas outras plataformas ainda não
/// existe (falta um WebView): [captchaSupported] diz se há.
class CaptchaBox extends StatelessWidget {
  final String siteKey;
  final ValueChanged<String?> onToken;

  const CaptchaBox({super.key, required this.siteKey, required this.onToken});

  @override
  Widget build(BuildContext context) => impl.buildCaptcha(siteKey, onToken);
}

bool get captchaSupported => impl.captchaSupported;
