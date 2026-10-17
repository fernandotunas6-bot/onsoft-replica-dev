import 'package:flutter/material.dart';

class AppColors {
  // Paleta suave. Substitui o lima #C7FF00 do autor, que saturava cada ecrã
  // e obrigava a texto preto para ser legível. Este azul acinzentado tem a
  // mesma função — fundo de botões e realces — com metade do ruído.
  static const Color primary = Color(0xFF93ACCB);

  /// Mesma família, escura o suficiente para texto em branco (recibos, PDF).
  static const Color primaryOnLight = Color(0xFF2F4A66);
  static const Color secondary = Color(0xFF2B3440);

  // Neutros
  static const Color background = Color(0xFFF7F8FA);
  static const Color surface = Colors.white;
  static const Color error = Color(0xFFD96A6A);

  // Texto
  static const Color textPrimary = Color(0xFF2B3440);
  static const Color textSecondary = Color(0xFF75828F);

  // Gradientes
  static const LinearGradient primaryGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [primary, Color(0xFF7D9BC1)],
  );
}
