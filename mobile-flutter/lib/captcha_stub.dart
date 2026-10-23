import 'package:flutter/foundation.dart';
import 'captcha.dart';

/// Alvos sem DOM: o desafio hCaptcha precisa de um WebView próprio, que este
/// incremento não empacota. Não há sinal e o login por senha fica indisponível
/// enquanto a protecção estiver activa no servidor.
CaptchaGate buildCaptchaGate(String siteKey, VoidCallback onToken) =>
    UnavailableCaptcha(configured: siteKey.isNotEmpty, supported: false);
