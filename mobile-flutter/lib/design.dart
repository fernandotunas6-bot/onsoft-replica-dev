import 'package:flutter/material.dart';

/// Measured design tokens for the SIGA Plus institutional client. Every metric
/// here comes from the approved screens; screens must not hardcode their own.
class Sg {
  // Spacing scale (4pt grid).
  static const double gutter = 20;
  static const double gapXs = 4;
  static const double gapS = 8;
  static const double gap = 12;
  static const double gapM = 16;
  static const double gapL = 24;
  static const double gapXl = 32;

  // Radii.
  static const double rField = 14;
  static const double rCard = 18;
  static const double rTile = 14;
  static const double rSheet = 28;
  static const double rPill = 999;

  // Sizes.
  static const double tile = 44;
  static const double avatar = 44;
  static const double control = 52;
  static const double navHeight = 64;
  static const double maxContent = 440;

  // Type scale.
  static const TextStyle display = TextStyle(
    fontSize: 30,
    fontWeight: FontWeight.w700,
    height: 1.2,
    letterSpacing: -.6,
  );
  static const TextStyle title = TextStyle(
    fontSize: 26,
    fontWeight: FontWeight.w700,
    height: 1.2,
    letterSpacing: -.4,
  );
  static const TextStyle section = TextStyle(
    fontSize: 17,
    fontWeight: FontWeight.w700,
    letterSpacing: -.2,
  );
  static const TextStyle itemTitle = TextStyle(
    fontSize: 15.5,
    fontWeight: FontWeight.w600,
    letterSpacing: -.1,
  );
  static const TextStyle body = TextStyle(fontSize: 15, height: 1.45);
  static const TextStyle caption = TextStyle(fontSize: 13, height: 1.35);
  static const TextStyle tiny = TextStyle(
    fontSize: 11.5,
    fontWeight: FontWeight.w600,
  );

  // Brand.
  static const Color primary = Color(0xff2f62f5);
  static const Color danger = Color(0xffe5484d);
  static const List<Color> brand = [
    Color(0xff7b5bff),
    Color(0xffe23fa6),
    Color(0xffff8a3d),
  ];
  static const LinearGradient brandGradient = LinearGradient(
    colors: brand,
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );
  static const LinearGradient wordmarkGradient = LinearGradient(
    colors: [Color(0xff4f57ff), Color(0xffe5379b), Color(0xffff8c3f)],
  );

  /// Accent pairs used by subject, service and notice tiles, in catalog order
  /// so the same subject keeps the same colour between sessions.
  static const List<List<Color>> accents = [
    [Color(0xff3b82f6), Color(0xffe8f0fe)],
    [Color(0xff8b5cf6), Color(0xfff1ecfe)],
    [Color(0xff10b981), Color(0xffe6f7f1)],
    [Color(0xfff59e0b), Color(0xfffdf0dd)],
    [Color(0xffec4899), Color(0xfffdecf5)],
    [Color(0xff06b6d4), Color(0xffe2f6fb)],
  ];
  static Color accent(Object? seed) => accents[_index(seed)][0];
  static Color accentSurface(Object? seed, Brightness brightness) =>
      brightness == Brightness.light
      ? accents[_index(seed)][1]
      : Color.alphaBlend(
          accents[_index(seed)][0].withValues(alpha: .18),
          const Color(0xff171b24),
        );
  static int _index(Object? seed) {
    final text = '$seed';
    var hash = 0;
    for (final unit in text.codeUnits) {
      hash = (hash * 31 + unit) & 0x7fffffff;
    }
    return text.isEmpty ? 0 : hash % accents.length;
  }

  /// Falls back to the brightness default so a screen still renders correctly
  /// when it is mounted outside the institutional theme (tests, previews).
  static SigaPalette of(BuildContext context) {
    final theme = Theme.of(context);
    return theme.extension<SigaPalette>() ??
        (theme.brightness == Brightness.dark
            ? SigaPalette.dark
            : SigaPalette.light);
  }
}

/// Surface palette kept outside ColorScheme so light and dark stay explicit.
@immutable
class SigaPalette extends ThemeExtension<SigaPalette> {
  const SigaPalette({
    required this.canvas,
    required this.surface,
    required this.border,
    required this.text,
    required this.muted,
    required this.faint,
  });
  final Color canvas;
  final Color surface;
  final Color border;
  final Color text;
  final Color muted;
  final Color faint;
  static const light = SigaPalette(
    canvas: Color(0xffffffff),
    surface: Color(0xfff5f6f8),
    border: Color(0xffe9ecf1),
    text: Color(0xff0f1522),
    muted: Color(0xff79808f),
    faint: Color(0xfffafbfc),
  );
  static const dark = SigaPalette(
    canvas: Color(0xff0f131a),
    surface: Color(0xff171b24),
    border: Color(0xff252b37),
    text: Color(0xfff3f5f9),
    muted: Color(0xff99a1b2),
    faint: Color(0xff141821),
  );
  @override
  SigaPalette copyWith({
    Color? canvas,
    Color? surface,
    Color? border,
    Color? text,
    Color? muted,
    Color? faint,
  }) => SigaPalette(
    canvas: canvas ?? this.canvas,
    surface: surface ?? this.surface,
    border: border ?? this.border,
    text: text ?? this.text,
    muted: muted ?? this.muted,
    faint: faint ?? this.faint,
  );
  @override
  SigaPalette lerp(SigaPalette? other, double t) {
    if (other == null) return this;
    return SigaPalette(
      canvas: Color.lerp(canvas, other.canvas, t)!,
      surface: Color.lerp(surface, other.surface, t)!,
      border: Color.lerp(border, other.border, t)!,
      text: Color.lerp(text, other.text, t)!,
      muted: Color.lerp(muted, other.muted, t)!,
      faint: Color.lerp(faint, other.faint, t)!,
    );
  }
}

ThemeData sigaTheme(Brightness brightness, {Color seed = Sg.primary}) {
  final palette = brightness == Brightness.light
      ? SigaPalette.light
      : SigaPalette.dark;
  final scheme = ColorScheme.fromSeed(seedColor: seed, brightness: brightness)
      .copyWith(
        primary: brightness == Brightness.light
            ? seed
            : Color.alphaBlend(Colors.white.withValues(alpha: .18), seed),
        surface: palette.canvas,
        outlineVariant: palette.border,
      );
  final base = ThemeData(
    useMaterial3: true,
    brightness: brightness,
    colorScheme: scheme,
  );
  return base.copyWith(
    scaffoldBackgroundColor: palette.canvas,
    extensions: [palette],
    textTheme: base.textTheme.apply(
      bodyColor: palette.text,
      displayColor: palette.text,
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: palette.canvas,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: Sg.section.copyWith(fontSize: 18, color: palette.text),
      iconTheme: IconThemeData(color: palette.text),
    ),
    dividerTheme: DividerThemeData(
      color: palette.border,
      space: 1,
      thickness: 1,
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(Sg.control),
        backgroundColor: scheme.primary,
        foregroundColor: Colors.white,
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(Sg.rField),
        ),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: scheme.primary,
        textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: palette.surface,
      hintStyle: Sg.body.copyWith(color: palette.muted),
      prefixIconColor: palette.muted,
      suffixIconColor: palette.muted,
      contentPadding: const EdgeInsets.symmetric(
        horizontal: Sg.gapM,
        vertical: Sg.gapM,
      ),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(Sg.rField),
        borderSide: BorderSide(color: palette.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(Sg.rField),
        borderSide: BorderSide(color: palette.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(Sg.rField),
        borderSide: BorderSide(color: scheme.primary, width: 1.4),
      ),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: palette.canvas,
      surfaceTintColor: Colors.transparent,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(Sg.rSheet)),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      height: Sg.navHeight,
      backgroundColor: palette.canvas,
      surfaceTintColor: Colors.transparent,
      indicatorColor: Colors.transparent,
      labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
      labelTextStyle: WidgetStateProperty.resolveWith(
        (states) => Sg.tiny.copyWith(
          fontSize: 11,
          color: states.contains(WidgetState.selected)
              ? scheme.primary
              : palette.muted,
        ),
      ),
      iconTheme: WidgetStateProperty.resolveWith(
        (states) => IconThemeData(
          size: 24,
          color: states.contains(WidgetState.selected)
              ? scheme.primary
              : palette.muted,
        ),
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(Sg.rField),
      ),
    ),
  );
}

/// Rounded square that holds a service or subject icon.
class IconTile extends StatelessWidget {
  const IconTile(
    this.icon, {
    super.key,
    this.seed,
    this.size = Sg.tile,
    this.color,
  });
  final IconData icon;
  final Object? seed;
  final double size;
  final Color? color;
  @override
  Widget build(BuildContext context) {
    final brightness = Theme.of(context).brightness;
    final tint = color ?? Sg.accent(seed);
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: color != null
            ? tint.withValues(alpha: brightness == Brightness.light ? .12 : .22)
            : Sg.accentSurface(seed, brightness),
        borderRadius: BorderRadius.circular(size * .32),
      ),
      child: Icon(icon, size: size * .5, color: tint),
    );
  }
}

/// Bordered container used by every card in the approved screens.
class SigaCard extends StatelessWidget {
  const SigaCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(Sg.gapM),
    this.onTap,
    this.color,
  });
  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  final Color? color;
  @override
  Widget build(BuildContext context) {
    final palette = Sg.of(context);
    return Material(
      color: color ?? palette.canvas,
      borderRadius: BorderRadius.circular(Sg.rCard),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(Sg.rCard),
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(Sg.rCard),
            border: Border.all(color: palette.border),
          ),
          child: Padding(padding: padding, child: child),
        ),
      ),
    );
  }
}

/// Row with the leading tile, two text lines and the trailing chevron, at the
/// spacing used across the approved lists.
class SigaRow extends StatelessWidget {
  const SigaRow({
    super.key,
    required this.leading,
    required this.title,
    this.subtitle,
    this.trailing,
    this.onTap,
    this.chevron = true,
  });
  final Widget leading;
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final VoidCallback? onTap;
  final bool chevron;
  @override
  Widget build(BuildContext context) {
    final palette = Sg.of(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(Sg.rCard),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          vertical: Sg.gap,
          horizontal: Sg.gapS,
        ),
        child: Row(
          children: [
            leading,
            const SizedBox(width: Sg.gap),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: Sg.itemTitle.copyWith(color: palette.text),
                  ),
                  if (subtitle != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      subtitle!,
                      style: Sg.caption.copyWith(color: palette.muted),
                    ),
                  ],
                ],
              ),
            ),
            if (trailing != null) trailing!,
            if (chevron && onTap != null)
              Padding(
                padding: const EdgeInsets.only(left: Sg.gapS),
                child: Icon(
                  Icons.chevron_right,
                  size: 20,
                  color: palette.muted,
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Section title with the optional «Ver todas» action.
class SectionHeader extends StatelessWidget {
  const SectionHeader(this.label, {super.key, this.action, this.onAction});
  final String label;
  final String? action;
  final VoidCallback? onAction;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(Sg.gapS, Sg.gapL, 0, Sg.gapS),
    child: Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: Sg.section.copyWith(color: Sg.of(context).text),
          ),
        ),
        if (action != null)
          TextButton(
            onPressed: onAction,
            child: Row(
              children: [
                Text(action!),
                const Icon(Icons.chevron_right, size: 16),
              ],
            ),
          ),
      ],
    ),
  );
}

/// Pill filters shown under the page title.
class FilterChips extends StatelessWidget {
  const FilterChips({
    super.key,
    required this.labels,
    required this.index,
    required this.onSelected,
    this.badges = const {},
  });
  final List<String> labels;
  final int index;
  final ValueChanged<int> onSelected;
  final Map<int, int> badges;
  @override
  Widget build(BuildContext context) {
    final palette = Sg.of(context);
    final primary = Theme.of(context).colorScheme.primary;
    return SizedBox(
      height: 36,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: labels.length,
        separatorBuilder: (_, _) => const SizedBox(width: Sg.gapS),
        itemBuilder: (context, i) {
          final selected = i == index;
          return InkWell(
            onTap: () => onSelected(i),
            borderRadius: BorderRadius.circular(Sg.rPill),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: Sg.gapM),
              decoration: BoxDecoration(
                color: selected ? primary : palette.surface,
                borderRadius: BorderRadius.circular(Sg.rPill),
              ),
              alignment: Alignment.center,
              child: Row(
                children: [
                  Text(
                    labels[i],
                    style: Sg.caption.copyWith(
                      fontWeight: FontWeight.w600,
                      color: selected ? Colors.white : palette.muted,
                    ),
                  ),
                  if (badges[i] != null) ...[
                    const SizedBox(width: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 5,
                        vertical: 1,
                      ),
                      decoration: BoxDecoration(
                        color: selected
                            ? Colors.white.withValues(alpha: .25)
                            : Sg.danger,
                        borderRadius: BorderRadius.circular(Sg.rPill),
                      ),
                      child: Text(
                        '${badges[i]}',
                        style: Sg.tiny.copyWith(
                          fontSize: 10,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

/// Search field as it appears on the catalog, school and message screens.
class SearchField extends StatelessWidget {
  const SearchField({
    super.key,
    required this.hint,
    required this.onChanged,
    this.controller,
  });
  final String hint;
  final ValueChanged<String> onChanged;
  final TextEditingController? controller;
  @override
  Widget build(BuildContext context) => TextField(
    controller: controller,
    onChanged: onChanged,
    textInputAction: TextInputAction.search,
    decoration: InputDecoration(
      hintText: hint,
      prefixIcon: const Icon(Icons.search, size: 20),
      contentPadding: const EdgeInsets.symmetric(vertical: 12),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(Sg.rField),
        borderSide: BorderSide(color: Sg.of(context).border),
      ),
    ),
  );
}

/// Circular avatar with institutional initials; no photo is invented.
class InitialsAvatar extends StatelessWidget {
  const InitialsAvatar(
    this.name, {
    super.key,
    this.size = Sg.avatar,
    this.gradient = false,
  });
  final String name;
  final double size;
  final bool gradient;
  @override
  Widget build(BuildContext context) {
    final parts = name
        .trim()
        .split(RegExp(r'\s+'))
        .where((p) => p.isNotEmpty)
        .toList();
    final initials = parts.isEmpty
        ? '—'
        : parts.length == 1
        ? parts.first.characters.first.toUpperCase()
        : '${parts.first.characters.first}${parts.last.characters.first}'
              .toUpperCase();
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: gradient ? Sg.brandGradient : null,
        color: gradient
            ? null
            : Sg.accentSurface(name, Theme.of(context).brightness),
      ),
      child: Text(
        initials,
        style: TextStyle(
          fontSize: size * .36,
          fontWeight: FontWeight.w700,
          color: gradient ? Colors.white : Sg.accent(name),
        ),
      ),
    );
  }
}

/// Small state label («Conceito», «Simulação», «Em preparação»).
class StateBadge extends StatelessWidget {
  const StateBadge(this.label, {super.key, this.tone});
  final String label;
  final Color? tone;
  @override
  Widget build(BuildContext context) {
    final palette = Sg.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: Sg.gap, vertical: 6),
      decoration: BoxDecoration(
        color: tone?.withValues(alpha: .12) ?? palette.surface,
        borderRadius: BorderRadius.circular(Sg.rPill),
      ),
      child: Text(label, style: Sg.tiny.copyWith(color: tone ?? palette.muted)),
    );
  }
}

/// Empty and error states share one shape so a failure never looks like data.
class StateMessage extends StatelessWidget {
  const StateMessage({
    super.key,
    required this.icon,
    required this.message,
    this.action,
    this.onAction,
  });
  final IconData icon;
  final String message;
  final String? action;
  final VoidCallback? onAction;
  @override
  Widget build(BuildContext context) {
    final palette = Sg.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(
        vertical: Sg.gapXl,
        horizontal: Sg.gapM,
      ),
      child: Column(
        children: [
          IconTile(icon, size: 56, color: palette.muted),
          const SizedBox(height: Sg.gapM),
          Text(
            message,
            textAlign: TextAlign.center,
            style: Sg.body.copyWith(color: palette.muted),
          ),
          if (action != null) ...[
            const SizedBox(height: Sg.gapM),
            SizedBox(
              width: 200,
              child: FilledButton.tonal(
                onPressed: onAction,
                child: Text(action!),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Footnote that states a limit of this client without dressing it as data.
class Footnote extends StatelessWidget {
  const Footnote(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) {
    final palette = Sg.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: Sg.gapL, bottom: Sg.gapS),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.shield_outlined, size: 16, color: palette.muted),
          const SizedBox(width: Sg.gapS),
          Expanded(
            child: Text(text, style: Sg.caption.copyWith(color: palette.muted)),
          ),
        ],
      ),
    );
  }
}
