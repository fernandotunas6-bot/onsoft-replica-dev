import 'package:flutter/widgets.dart';

import 'captcha_box_stub.dart'
    if (dart.library.js_interop) 'captcha_box_web.dart'
    if (dart.library.io) 'captcha_box_mobile.dart'
    as impl;

/// O desafio hCaptcha que o Supabase do SIGA exige para entrar. Chama
/// [onToken] com o token resolvido, ou com null quando expira.
///
/// Na web usa o widget oficial do hCaptcha; no Android e iOS, o mesmo widget
/// num WebView. Noutras plataformas não há: [captchaSupported] diz se há.
class CaptchaBox extends StatelessWidget {
  final String siteKey;
  final ValueChanged<String?> onToken;

  const CaptchaBox({super.key, required this.siteKey, required this.onToken});

  @override
  Widget build(BuildContext context) => impl.buildCaptcha(siteKey, onToken);
}

bool get captchaSupported => impl.captchaSupported;
