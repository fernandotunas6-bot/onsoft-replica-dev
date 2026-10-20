import 'package:flutter/material.dart';
import 'package:fluentui_system_icons/fluentui_system_icons.dart';

/// Design system SIGA Plus 2026: branco como superfície, preto suave nos
/// títulos, cinzento no texto secundário, um azul institucional nas acções e
/// selecções. O gradiente pertence só à identidade (o «S» e a marca).
class Siga {
  Siga._();

  // Espaçamento em múltiplos de 8.
  static const double s1 = 8;
  static const double s2 = 16;
  static const double s3 = 24;
  static const double s4 = 32;

  // Cantos proporcionais.
  static const double rSmall = 12;
  static const double rMedium = 16;
  static const double rLarge = 24;

  static const Color ink = Color(0xff14161b);
  static const Color ink2 = Color(0xff5d6472);
  static const Color line = Color(0x1414161b);
  static const Color surface2 = Color(0xfff4f5f7);
  static const Color darkSurface = Color(0xff121318);
  static const Color darkSurface2 = Color(0xff1e2027);
  static const Color darkInk2 = Color(0xffa9b0bd);

  static const Color institutionalBlue = Color(0xff2f6bff);

  /// Cores principais de Aparência (ecrã 12): azul, violeta, laranja,
  /// verde-água e cinzento. Mudam só o destaque.
  static const List<(String, Color)> accents = [
    ('Azul', institutionalBlue),
    ('Violeta', Color(0xff9b5cf6)),
    ('Laranja', Color(0xffff8a3d)),
    ('Verde-água', Color(0xff1fbf9f)),
    ('Cinzento', Color(0xff8e949e)),
  ];

  /// Cor de cada disciplina (ecrã 8): ícone na cor, fundo suave da mesma cor.
  static const List<Color> subjectColors = [
    Color(0xff2f6bff),
    Color(0xff1fbf8f),
    Color(0xff4b6bff),
    Color(0xffff8a3d),
    Color(0xff9b5cf6),
    Color(0xff14b8c4),
  ];

  /// Cor estável de uma disciplina, pela ordem em que aparece no catálogo.
  static Color subjectColor(int index) =>
      subjectColors[index % subjectColors.length];

  /// Planos de fundo do painel (ecrã 12), usados no topo do início.
  static const List<List<Color>> backdrops = [
    [Color(0xffc9b6ff), Color(0xff8fb8ff), Color(0xffffb3d9)],
    [Color(0xffd7e6ff), Color(0xffb9cfff), Color(0xffe9d9ff)],
    [Color(0xffffd6c2), Color(0xffffc2e0), Color(0xffd9d2ff)],
  ];

  static const LinearGradient brand = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [
      Color(0xffff2f82),
      Color(0xffff8a3d),
      Color(0xffa259ff),
      Color(0xff3d7bff),
    ],
    stops: [0, .34, .68, 1],
  );

  static const Curve ease = Cubic(0.22, 1, 0.36, 1);
  static const Duration quick = Duration(milliseconds: 200);
  static const Duration medium = Duration(milliseconds: 360);

  /// Duração das animações: zero quando o movimento está reduzido.
  static Duration motion(BuildContext context, Duration value) =>
      MediaQuery.disableAnimationsOf(context) ? Duration.zero : value;
}

/// Cores do tema que não existem no `ColorScheme` do Material.
@immutable
class SigaPalette extends ThemeExtension<SigaPalette> {
  const SigaPalette({
    required this.surface2,
    required this.ink2,
    required this.line,
    required this.accentSoft,
  });
  final Color surface2;
  final Color ink2;
  final Color line;
  final Color accentSoft;

  /// Paleta do tema; fora do tema SIGA (testes, diálogos do sistema) usa a
  /// paleta clara por omissão.
  static SigaPalette of(BuildContext context) =>
      Theme.of(context).extension<SigaPalette>() ?? fallback;

  static const fallback = SigaPalette(
    surface2: Siga.surface2,
    ink2: Siga.ink2,
    line: Siga.line,
    accentSoft: Color(0xffe9effd),
  );

  @override
  SigaPalette copyWith({
    Color? surface2,
    Color? ink2,
    Color? line,
    Color? accentSoft,
  }) => SigaPalette(
    surface2: surface2 ?? this.surface2,
    ink2: ink2 ?? this.ink2,
    line: line ?? this.line,
    accentSoft: accentSoft ?? this.accentSoft,
  );

  @override
  SigaPalette lerp(SigaPalette? other, double t) {
    if (other == null) return this;
    return SigaPalette(
      surface2: Color.lerp(surface2, other.surface2, t)!,
      ink2: Color.lerp(ink2, other.ink2, t)!,
      line: Color.lerp(line, other.line, t)!,
      accentSoft: Color.lerp(accentSoft, other.accentSoft, t)!,
    );
  }
}

ThemeData sigaTheme(Brightness brightness, Color accent) {
  final light = brightness == Brightness.light;
  final surface = light ? Colors.white : Siga.darkSurface;
  final ink = light ? Siga.ink : const Color(0xfff2f3f5);
  final ink2 = light ? Siga.ink2 : Siga.darkInk2;
  final line = light ? Siga.line : const Color(0x17ffffff);
  final surface2 = light ? Siga.surface2 : Siga.darkSurface2;
  final primary = light ? accent : Color.lerp(accent, Colors.white, .28)!;
  final accentSoft = Color.lerp(surface, accent, light ? .1 : .22)!;
  final scheme = ColorScheme.fromSeed(seedColor: accent, brightness: brightness)
      .copyWith(
        primary: primary,
        onPrimary: Colors.white,
        surface: surface,
        onSurface: ink,
        onSurfaceVariant: ink2,
        outlineVariant: line,
        secondaryContainer: accentSoft,
        onSecondaryContainer: primary,
      );
  final text = ThemeData(
    brightness: brightness,
    useMaterial3: true,
    fontFamily: 'Inter',
  ).textTheme.apply(bodyColor: ink, displayColor: ink);
  return ThemeData(
    useMaterial3: true,
    fontFamily: 'Inter',
    brightness: brightness,
    colorScheme: scheme,
    scaffoldBackgroundColor: surface,
    splashFactory: InkSparkle.splashFactory,
    textTheme: text.copyWith(
      headlineSmall: text.headlineSmall?.copyWith(
        fontWeight: FontWeight.w700,
        letterSpacing: -.4,
      ),
      titleLarge: text.titleLarge?.copyWith(fontWeight: FontWeight.w700),
      titleMedium: text.titleMedium?.copyWith(fontWeight: FontWeight.w600),
      bodyMedium: text.bodyMedium?.copyWith(color: ink2),
      bodySmall: text.bodySmall?.copyWith(color: ink2),
    ),
    extensions: [
      SigaPalette(
        surface2: surface2,
        ink2: ink2,
        line: line,
        accentSoft: accentSoft,
      ),
    ],
    // Voltar com o chevron Fluent em todas as páginas, também nas que usam a
    // seta automática do AppBar.
    actionIconTheme: ActionIconThemeData(
      backButtonIconBuilder: (_) =>
          const Icon(FluentIcons.chevron_left_24_regular),
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: surface,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: text.titleLarge?.copyWith(
        fontSize: 20,
        fontWeight: FontWeight.w700,
        color: ink,
      ),
    ),
    dividerTheme: DividerThemeData(color: line, thickness: 1, space: 1),
    iconTheme: IconThemeData(color: ink, size: 22),
    listTileTheme: ListTileThemeData(
      iconColor: ink,
      contentPadding: const EdgeInsets.symmetric(horizontal: Siga.s2),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(Siga.rMedium),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: surface2,
      contentPadding: const EdgeInsets.symmetric(
        horizontal: Siga.s2,
        vertical: 14,
      ),
      prefixIconColor: ink2,
      hintStyle: TextStyle(color: ink2),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(Siga.rSmall),
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(Siga.rSmall),
        borderSide: BorderSide(color: line),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(Siga.rSmall),
        borderSide: BorderSide(color: primary, width: 1.5),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(52),
        backgroundColor: primary,
        foregroundColor: Colors.white,
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(Siga.rSmall),
        ),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: surface2,
      selectedColor: primary,
      side: BorderSide.none,
      labelStyle: TextStyle(color: ink, fontWeight: FontWeight.w500),
      secondaryLabelStyle: const TextStyle(
        color: Colors.white,
        fontWeight: FontWeight.w600,
      ),
      checkmarkColor: Colors.white,
      shape: const StadiumBorder(),
      padding: const EdgeInsets.symmetric(horizontal: 6),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: surface,
      surfaceTintColor: Colors.transparent,
      showDragHandle: true,
      dragHandleColor: line,
      // Escurecimento discreto, sem desfoque.
      modalBarrierColor: const Color(0x5c0c0e14),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(Siga.rLarge)),
      ),
    ),
    switchTheme: SwitchThemeData(
      thumbColor: const WidgetStatePropertyAll(Colors.white),
      trackColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected) ? primary : line,
      ),
      trackOutlineColor: const WidgetStatePropertyAll(Colors.transparent),
    ),
    pageTransitionsTheme: const PageTransitionsTheme(
      builders: {
        TargetPlatform.android: FadeForwardsPageTransitionsBuilder(),
        TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
        TargetPlatform.macOS: CupertinoPageTransitionsBuilder(),
      },
    ),
  );
}

/// Preferências de Aparência que mudam os ecrãs: plano de fundo do painel
/// (ecrã 12) e ícones modernos — Fluent em traço fino (por omissão);
/// desligado, a mesma família na versão cheia.
class AppearanceScope extends InheritedWidget {
  const AppearanceScope({
    super.key,
    required this.backdrop,
    required this.modernIcons,
    required super.child,
  });

  /// Índice em [Siga.backdrops], ou null sem plano de fundo.
  final int? backdrop;
  final bool modernIcons;

  static AppearanceScope? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<AppearanceScope>();

  /// Escolhe o ícone conforme a preferência «Utilizar ícones modernos»:
  /// [line] (traço) quando ligada, [classic] (cheio) quando desligada.
  static IconData icon(BuildContext context, IconData line, IconData classic) =>
      (maybeOf(context)?.modernIcons ?? true) ? line : classic;

  @override
  bool updateShouldNotify(AppearanceScope old) =>
      old.backdrop != backdrop || old.modernIcons != modernIcons;
}
