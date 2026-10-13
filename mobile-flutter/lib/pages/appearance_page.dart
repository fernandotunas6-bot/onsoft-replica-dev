import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../design/tokens.dart';
import '../design/widgets.dart';

/// Aparência (ecrã 12): tema, plano de fundo do painel, cor principal,
/// movimento e estilo dos ícones. Só preferências deste dispositivo.
class AppearancePage extends StatelessWidget {
  const AppearancePage({
    super.key,
    required this.mode,
    required this.accent,
    required this.reduced,
    required this.onMode,
    required this.onAccent,
    required this.onReduced,
    this.backdrop,
    this.onBackdrop,
    this.modernIcons = false,
    this.onModernIcons,
  });
  final ThemeMode mode;
  final Color accent;
  final bool reduced;
  final ValueChanged<ThemeMode> onMode;
  final ValueChanged<Color> onAccent;
  final ValueChanged<bool> onReduced;
  final int? backdrop;
  final ValueChanged<int?>? onBackdrop;
  final bool modernIcons;
  final ValueChanged<bool>? onModernIcons;

  @override
  Widget build(BuildContext context) {
    final palette = SigaPalette.of(context);
    final scheme = Theme.of(context).colorScheme;
    const modes = [
      (ThemeMode.system, 'Sistema', LucideIcons.monitor),
      (ThemeMode.light, 'Claro', LucideIcons.sun),
      (ThemeMode.dark, 'Escuro', LucideIcons.moon),
    ];
    Widget heading(String text) => Padding(
      padding: const EdgeInsets.only(top: Siga.s3, bottom: 12),
      child: Semantics(
        header: true,
        child: Text(
          text,
          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
        ),
      ),
    );
    return ListView(
      padding: const EdgeInsets.fromLTRB(Siga.s3, 0, Siga.s3, Siga.s3),
      children: [
        heading('Tema'),
        Row(
          children: [
            for (final (value, label, icon) in modes)
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 5),
                  child: Semantics(
                    button: true,
                    selected: mode == value,
                    label: 'Tema $label',
                    excludeSemantics: true,
                    child: InkWell(
                      onTap: () => onMode(value),
                      borderRadius: BorderRadius.circular(Siga.rMedium),
                      child: AnimatedContainer(
                        duration: Siga.motion(context, Siga.quick),
                        height: 92,
                        decoration: BoxDecoration(
                          color: mode == value
                              ? palette.accentSoft
                              : scheme.surface,
                          borderRadius: BorderRadius.circular(Siga.rMedium),
                          border: Border.all(
                            color: mode == value
                                ? scheme.primary
                                : palette.line,
                            width: mode == value ? 1.6 : 1,
                          ),
                        ),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              icon,
                              size: 26,
                              color: mode == value ? scheme.primary : null,
                            ),
                            const SizedBox(height: 10),
                            Text(
                              label,
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
        if (onBackdrop != null) ...[
          heading('Plano de fundo do painel'),
          Row(
            children: [
              for (var i = 0; i < Siga.backdrops.length; i++)
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 5),
                    child: Semantics(
                      button: true,
                      selected: backdrop == i,
                      label: 'Plano de fundo ${i + 1}',
                      excludeSemantics: true,
                      child: GestureDetector(
                        // Tocar no escolhido volta a deixar o painel liso.
                        onTap: () => onBackdrop!(backdrop == i ? null : i),
                        child: AnimatedContainer(
                          duration: Siga.motion(context, Siga.quick),
                          height: 64,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(Siga.rSmall),
                            gradient: LinearGradient(
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                              colors: Siga.backdrops[i],
                            ),
                            border: Border.all(
                              color: backdrop == i
                                  ? scheme.primary
                                  : Colors.transparent,
                              width: 2,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ],
        heading('Cor principal'),
        Wrap(
          spacing: 18,
          runSpacing: 12,
          children: [
            for (final (name, color) in Siga.accents)
              Semantics(
                button: true,
                selected: accent == color,
                label: 'Cor principal: $name',
                excludeSemantics: true,
                child: InkWell(
                  customBorder: const CircleBorder(),
                  onTap: () => onAccent(color),
                  child: AnimatedContainer(
                    duration: Siga.motion(context, Siga.quick),
                    width: 44,
                    height: 44,
                    padding: const EdgeInsets.all(4),
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: accent == color ? color : Colors.transparent,
                        width: 2,
                      ),
                    ),
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        color: color,
                        shape: BoxShape.circle,
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: Siga.s3),
        _ToggleRow(
          icon: LucideIcons.activity,
          color: const Color(0xffff4f8b),
          title: 'Reduzir movimentos',
          subtitle: 'Animações mais suaves.',
          value: reduced,
          onChanged: onReduced,
        ),
        if (onModernIcons != null)
          _ToggleRow(
            icon: LucideIcons.layoutDashboard,
            color: const Color(0xff1fbf9f),
            title: 'Utilizar ícones modernos',
            subtitle: 'Estilo 2026.',
            value: modernIcons,
            onChanged: onModernIcons!,
          ),
      ],
    );
  }
}

class _ToggleRow extends StatelessWidget {
  const _ToggleRow({
    required this.icon,
    required this.color,
    required this.title,
    required this.subtitle,
    required this.value,
    required this.onChanged,
  });
  final IconData icon;
  final Color color;
  final String title;
  final String subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 8),
    child: Row(
      children: [
        TintIcon(icon, color: color, size: 40),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
              Text(subtitle, style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
        ),
        Semantics(
          label: title,
          child: Switch(value: value, onChanged: onChanged),
        ),
      ],
    ),
  );
}
