import 'package:flutter/material.dart';
import '../design/tokens.dart';
import '../design/widgets.dart';

/// Aparência: tema, cor principal e movimento reduzido. Só preferências deste
/// dispositivo; nada disto vai para o servidor.
class AppearancePage extends StatelessWidget {
  const AppearancePage({
    super.key,
    required this.mode,
    required this.accent,
    required this.reduced,
    required this.onMode,
    required this.onAccent,
    required this.onReduced,
  });
  final ThemeMode mode;
  final Color accent;
  final bool reduced;
  final ValueChanged<ThemeMode> onMode;
  final ValueChanged<Color> onAccent;
  final ValueChanged<bool> onReduced;

  @override
  Widget build(BuildContext context) {
    final palette = SigaPalette.of(context);
    final scheme = Theme.of(context).colorScheme;
    const modes = [
      (ThemeMode.system, 'Sistema', Icons.phone_android_outlined),
      (ThemeMode.light, 'Claro', Icons.light_mode_outlined),
      (ThemeMode.dark, 'Escuro', Icons.dark_mode_outlined),
    ];
    return ListView(
      padding: const EdgeInsets.all(Siga.s3),
      children: [
        const SectionHeader('Tema'),
        Row(
          children: [
            for (final (value, label, icon) in modes)
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
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
                        padding: const EdgeInsets.symmetric(vertical: Siga.s2),
                        decoration: BoxDecoration(
                          color: mode == value
                              ? palette.accentSoft
                              : palette.surface2,
                          borderRadius: BorderRadius.circular(Siga.rMedium),
                          border: Border.all(
                            color: mode == value
                                ? scheme.primary
                                : Colors.transparent,
                            width: 1.5,
                          ),
                        ),
                        child: Column(
                          children: [
                            Icon(
                              icon,
                              color: mode == value ? scheme.primary : null,
                            ),
                            const SizedBox(height: Siga.s1),
                            Text(
                              label,
                              style: const TextStyle(
                                fontWeight: FontWeight.w600,
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
        const SectionHeader('Cor principal'),
        Wrap(
          spacing: Siga.s2,
          runSpacing: Siga.s2,
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
                        color: accent == color ? color : palette.line,
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
        const SectionHeader('Movimento'),
        SwitchListTile(
          contentPadding: const EdgeInsets.symmetric(horizontal: Siga.s1),
          title: const Text('Reduzir movimentos'),
          subtitle: const Text(
            'Sem a abertura animada nem transições. A preferência do '
            'dispositivo também conta.',
          ),
          value: reduced,
          onChanged: onReduced,
        ),
      ],
    );
  }
}
