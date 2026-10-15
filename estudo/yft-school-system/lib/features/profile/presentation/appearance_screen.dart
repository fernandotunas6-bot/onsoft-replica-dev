import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/theme/appearance_state.dart';
import 'package:yft_school_system/core/utils/responsive_utils.dart';
import 'package:yft_school_system/core/widgets/section_widgets.dart';

/// Aparência: tema, fundo do painel, cor principal, movimento e ícones.
/// As escolhas ficam neste dispositivo e aplicam-se de imediato.
class AppearanceScreen extends ConsumerWidget {
  const AppearanceScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(appearanceProvider);
    final n = ref.read(appearanceProvider.notifier);

    Widget label(String text) => Padding(
      padding: const EdgeInsets.only(top: 28, bottom: 12),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.w600,
          color: AppColors.textPrimary,
        ),
      ),
    );

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Aparência', style: TextStyle(fontWeight: FontWeight.w600)),
      ),
      body: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(
          getResponsiveHorizontalPadding(context).left,
          0,
          getResponsiveHorizontalPadding(context).right,
          40,
        ),
        child: ResponsiveConstrainedContent(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              label('Tema'),
              Row(
                children: [
                  for (final (mode, icon, text) in [
                    (AppThemeMode.system, LucideIcons.monitor, 'Sistema'),
                    (AppThemeMode.light, LucideIcons.sun, 'Claro'),
                    (AppThemeMode.dark, LucideIcons.moon, 'Escuro'),
                  ])
                    Expanded(
                      child: Padding(
                        padding: EdgeInsets.only(
                          right: mode == AppThemeMode.dark ? 0 : 10,
                        ),
                        child: _ThemeOption(
                          icon: icon,
                          label: text,
                          selected: s.themeMode == mode,
                          onTap: () => n.setThemeMode(mode),
                        ),
                      ),
                    ),
                ],
              ),
              label('Plano de fundo do painel'),
              Row(
                children: [
                  for (final b in AppColors.backdrops)
                    Expanded(
                      child: Padding(
                        padding: EdgeInsets.only(
                          right: b == AppColors.backdrops.last ? 0 : 10,
                        ),
                        child: _BackdropOption(
                          colors: b.colors,
                          selected: s.backdropId == b.id,
                          onTap: () => n.setBackdrop(b.id),
                        ),
                      ),
                    ),
                ],
              ),
              label('Cor principal'),
              Wrap(
                spacing: 16,
                runSpacing: 12,
                children: [
                  for (final a in AppColors.accents)
                    Semantics(
                      label: a.label,
                      selected: s.accentId == a.id,
                      button: true,
                      child: GestureDetector(
                        onTap: () => n.setAccent(a.id),
                        child: Container(
                          width: 44,
                          height: 44,
                          padding: const EdgeInsets.all(3),
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            border: Border.all(
                              color: s.accentId == a.id
                                  ? a.color
                                  : Colors.transparent,
                              width: 2,
                            ),
                          ),
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              color: a.color,
                              shape: BoxShape.circle,
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 28),
              _SwitchRow(
                icon: LucideIcons.wind,
                color: AppColors.tileColors[4],
                title: 'Reduzir movimentos',
                subtitle: 'Animações mais suaves.',
                value: s.reduceMotion,
                onChanged: n.setReduceMotion,
              ),
              const SizedBox(height: 10),
              _SwitchRow(
                icon: LucideIcons.sparkles,
                color: AppColors.tileColors[1],
                title: 'Utilizar ícones modernos',
                subtitle: 'Traço fino na navegação.',
                value: s.modernIcons,
                onChanged: n.setModernIcons,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ThemeOption extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _ThemeOption({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final fg = selected ? AppColors.primary : AppColors.textPrimary;
    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 18),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: selected ? AppColors.primary : AppColors.border,
              width: selected ? 2 : 1,
            ),
          ),
          child: Column(
            children: [
              Icon(icon, color: fg, size: 26),
              const SizedBox(height: 8),
              Text(label, style: TextStyle(fontSize: 13, color: fg)),
            ],
          ),
        ),
      ),
    );
  }
}

class _BackdropOption extends StatelessWidget {
  final List<Color> colors;
  final bool selected;
  final VoidCallback onTap;

  const _BackdropOption({
    required this.colors,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AspectRatio(
        aspectRatio: 1.25,
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: colors,
            ),
            border: Border.all(
              color: selected ? AppColors.primary : Colors.transparent,
              width: 2.5,
            ),
          ),
          alignment: Alignment.topRight,
          padding: const EdgeInsets.all(6),
          child: selected
              ? Icon(Icons.check_circle_rounded, color: AppColors.primary, size: 20)
              : null,
        ),
      ),
    );
  }
}

class _SwitchRow extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String title;
  final String subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;

  const _SwitchRow({
    required this.icon,
    required this.color,
    required this.title,
    required this.subtitle,
    required this.value,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return SoftCard(
      onTap: () => onChanged(!value),
      padding: const EdgeInsets.fromLTRB(14, 10, 8, 10),
      child: Row(
        children: [
          IconTile(icon: icon, color: color, size: 40),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                    color: AppColors.textPrimary,
                  ),
                ),
                Text(
                  subtitle,
                  style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
                ),
              ],
            ),
          ),
          Switch(value: value, onChanged: onChanged),
        ],
      ),
    );
  }
}
