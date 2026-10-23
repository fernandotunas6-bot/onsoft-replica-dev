library;

/// Escolhe a implementação do desafio pelo alvo de compilação.
export 'captcha_stub.dart'
    if (dart.library.js_interop) 'captcha_web.dart'
    show buildCaptchaGate;
