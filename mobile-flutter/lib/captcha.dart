import 'package:flutter/widgets.dart';

/// Sinal anti-robô exigido pelo Supabase Auth deste projecto.
///
/// O sinal é de uso único: depois de cada tentativa — falhada ou não — é
/// preciso `reset()`, senão a tentativa seguinte reenvia um sinal já gasto e
/// volta a dar `captcha_failed`.
abstract class CaptchaGate {
  /// A chave pública do site existe neste build.
  bool get configured;

  /// Este alvo consegue apresentar o desafio (hoje: apenas Web).
  bool get supported;

  /// Sinal já resolvido pela pessoa, ou `null` enquanto não houver.
  String? get token;

  /// Widget do desafio, ou `null` quando não há nada para apresentar.
  Widget? build(BuildContext context);

  /// Descarta o sinal gasto e pede um novo desafio.
  void reset();

  void dispose();
}

/// Usado quando falta a chave do site ou o alvo não suporta o desafio.
/// Não finge um sinal: quem chama decide a mensagem a apresentar.
class UnavailableCaptcha implements CaptchaGate {
  const UnavailableCaptcha({required this.configured, required this.supported});
  @override
  final bool configured;
  @override
  final bool supported;
  @override
  String? get token => null;
  @override
  Widget? build(BuildContext context) => null;
  @override
  void reset() {}
  @override
  void dispose() {}
}
