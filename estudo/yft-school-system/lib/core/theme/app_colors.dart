import 'package:flutter/material.dart';

/// Uma cor principal que o utilizador pode escolher em Aparência.
class AccentOption {
  final String id;
  final String label;
  final Color color;

  const AccentOption(this.id, this.label, this.color);
}

/// Um fundo de painel: um gradiente suave por trás do cabeçalho do início.
class BackdropOption {
  final String id;
  final List<Color> colors;

  const BackdropOption(this.id, this.colors);
}

/// Paleta da aplicação.
///
/// Os campos deixaram de ser `const` porque a cor principal e o modo escuro
/// mudam em tempo de execução (ecrã Aparência). Quem lê `AppColors.x` lê a
/// paleta activa; [AppColors.apply] troca-a e a raiz reconstrói a árvore.
class AppColors {
  // ── Marca (fixa) ──

  /// Gradiente do logótipo SIGA Plus: laranja → rosa → roxo → azul.
  static const List<Color> brandColors = [
    Color(0xFFFF8A3D),
    Color(0xFFFF3D8B),
    Color(0xFF9B5CFF),
    Color(0xFF3D7BFF),
  ];

  static const LinearGradient brandGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: brandColors,
  );

  static const List<AccentOption> accents = [
    AccentOption('blue', 'Azul', Color(0xFF2563EB)),
    AccentOption('violet', 'Roxo', Color(0xFF7C3AED)),
    AccentOption('orange', 'Laranja', Color(0xFFF97316)),
    AccentOption('teal', 'Verde-água', Color(0xFF14B8A6)),
    AccentOption('slate', 'Cinza', Color(0xFF64748B)),
  ];

  static const List<BackdropOption> backdrops = [
    BackdropOption('aurora', [Color(0xFF7FA8FF), Color(0xFFE38BFF), Color(0xFFFFB38A)]),
    BackdropOption('mist', [Color(0xFFB9D3FF), Color(0xFFE7EEFF), Color(0xFFD8C8FF)]),
    BackdropOption('sunset', [Color(0xFFFFC2D6), Color(0xFFFFD8B5), Color(0xFFC9D6FF)]),
  ];

  /// Cores dos mosaicos de disciplina (ícone sobre o tom a 12 %).
  static const List<Color> tileColors = [
    Color(0xFF2563EB),
    Color(0xFF10B981),
    Color(0xFF6366F1),
    Color(0xFFF97316),
    Color(0xFFA855F7),
    Color(0xFF0EA5E9),
  ];

  // ── Paleta activa ──

  static Color primary = accents.first.color;

  /// Texto e ícones sobre [primary]: branco ou tinta, o que passar AA.
  static Color onPrimary = Colors.white;

  /// Mesma família, legível sobre branco (recibos, PDF). Fixa: o papel é branco.
  static const Color primaryOnLight = Color(0xFF1E40AF);

  /// Títulos e texto forte. Claro no modo escuro.
  static Color secondary = const Color(0xFF1E2633);

  /// Superfícies escuras (cartões e etiquetas com texto branco), nos dois modos.
  static Color ink = const Color(0xFF1E2633);

  static Color background = const Color(0xFFF6F7FB);
  static Color surface = Colors.white;
  static Color border = const Color(0xFFE6E9F0);
  static const Color error = Color(0xFFE5484D);
  static const Color success = Color(0xFF10B981);
  static const Color warning = Color(0xFFF59E0B);

  static Color textPrimary = const Color(0xFF1E2633);
  static Color textSecondary = const Color(0xFF6B7585);

  static bool isDark = false;

  static LinearGradient get primaryGradient => LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [primary, Color.lerp(primary, const Color(0xFF9B5CFF), 0.35)!],
  );

  static AccentOption accentById(String? id) =>
      accents.firstWhere((a) => a.id == id, orElse: () => accents.first);

  static BackdropOption backdropById(String? id) =>
      backdrops.firstWhere((b) => b.id == id, orElse: () => backdrops.first);

  /// Activa a paleta para a cor principal [accent] e o modo [dark].
  static void apply({required Color accent, required bool dark}) {
    isDark = dark;
    primary = accent;
    onPrimary = _readableOn(accent);
    if (dark) {
      background = const Color(0xFF0E131A);
      surface = const Color(0xFF171E28);
      border = const Color(0xFF263040);
      secondary = const Color(0xFFE8ECF2);
      ink = const Color(0xFF243044);
      textPrimary = const Color(0xFFE8ECF2);
      textSecondary = const Color(0xFF98A3B3);
    } else {
      background = const Color(0xFFF6F7FB);
      surface = Colors.white;
      border = const Color(0xFFE6E9F0);
      secondary = const Color(0xFF1E2633);
      ink = const Color(0xFF1E2633);
      textPrimary = const Color(0xFF1E2633);
      textSecondary = const Color(0xFF6B7585);
    }
  }

  static Color _readableOn(Color bg) {
    const dark = Color(0xFF1E2633);
    return contrast(Colors.white, bg) >= 4.5 ? Colors.white : dark;
  }

  /// Rácio de contraste WCAG entre duas cores.
  static double contrast(Color a, Color b) {
    final la = a.computeLuminance();
    final lb = b.computeLuminance();
    final hi = la > lb ? la : lb;
    final lo = la > lb ? lb : la;
    return (hi + 0.05) / (lo + 0.05);
  }
}
