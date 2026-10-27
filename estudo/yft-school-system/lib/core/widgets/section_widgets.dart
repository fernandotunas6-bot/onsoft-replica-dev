import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../theme/app_colors.dart';
import '../theme/motion.dart';

/// Título de secção com ligação "Ver todas" à direita.
class SectionHeader extends StatelessWidget {
  final String title;
  final String? actionLabel;
  final VoidCallback? onAction;

  const SectionHeader({
    super.key,
    required this.title,
    this.actionLabel,
    this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Expanded(
            child: Text(
              title,
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w600,
                color: AppColors.textPrimary,
              ),
            ),
          ),
          if (actionLabel != null)
            InkWell(
              onTap: onAction,
              borderRadius: BorderRadius.circular(8),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                child: Row(
                  children: [
                    Text(
                      actionLabel!,
                      style: TextStyle(fontSize: 13, color: AppColors.primary),
                    ),
                    Icon(Icons.chevron_right_rounded,
                        size: 18, color: AppColors.primary),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Mosaico quadrado com o ícone sobre o tom da cor a 12 %.
class IconTile extends StatelessWidget {
  final IconData icon;
  final Color color;
  final double size;

  const IconTile({
    super.key,
    required this.icon,
    required this.color,
    this.size = 48,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: color.withValues(alpha: AppColors.isDark ? 0.22 : 0.12),
        borderRadius: BorderRadius.circular(size * 0.3),
      ),
      child: Icon(icon, color: color, size: size * 0.48),
    );
  }
}

/// Cartão branco com contorno fino, a base das listas. Com [onTap], encolhe
/// um pouco ao toque e volta com mola. Dentro de um [CardGroup], os cantos
/// seguem a posição no grupo.
class SoftCard extends StatefulWidget {
  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsetsGeometry padding;

  /// Cantos próprios; sem eles, os do [CardGroup] ou 20.
  final BorderRadius? radius;

  const SoftCard({
    super.key,
    required this.child,
    this.onTap,
    this.padding = const EdgeInsets.all(16),
    this.radius,
  });

  @override
  State<SoftCard> createState() => _SoftCardState();
}

class _SoftCardState extends State<SoftCard> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final radius =
        widget.radius ??
        CardGroup.radiusOf(context) ??
        BorderRadius.circular(20);
    final card = Material(
      color: AppColors.surface,
      borderRadius: radius,
      child: InkWell(
        onTap: widget.onTap,
        onHighlightChanged: widget.onTap == null
            ? null
            : (v) {
                if (v != _pressed) setState(() => _pressed = v);
              },
        borderRadius: radius,
        child: Container(
          padding: widget.padding,
          decoration: BoxDecoration(
            borderRadius: radius,
            border: Border.all(color: AppColors.border),
          ),
          child: widget.child,
        ),
      ),
    );
    if (widget.onTap == null) return card;
    return AnimatedScale(
      scale: _pressed ? 0.98 : 1,
      duration: AppMotion.of(
        context,
        _pressed ? AppMotion.fast : AppMotion.medium,
      ),
      curve: _pressed ? AppMotion.effects : AppMotion.press,
      child: card,
    );
  }
}

/// Lista de cartões ligados (Material 3 Expressive): pouco espaço entre eles,
/// cantos largos por fora e estreitos por dentro, para se lerem como um bloco.
/// Os filhos que forem [SoftCard] (directos ou dentro de outro widget) ficam
/// com os cantos certos.
class CardGroup extends StatelessWidget {
  final List<Widget> children;
  final double gap;

  const CardGroup({super.key, required this.children, this.gap = 3});

  static const _outer = Radius.circular(22);
  static const _inner = Radius.circular(6);

  /// Cantos do cartão [index] num grupo de [count].
  static BorderRadius radiusAt(int index, int count) {
    if (count <= 1) return const BorderRadius.all(_outer);
    final first = index == 0;
    final last = index == count - 1;
    return BorderRadius.vertical(
      top: first ? _outer : _inner,
      bottom: last ? _outer : _inner,
    );
  }

  static BorderRadius? radiusOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<_CardSlot>()?.radius;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < children.length; i++) ...[
          if (i > 0) SizedBox(height: gap),
          _CardSlot(radius: radiusAt(i, children.length), child: children[i]),
        ],
      ],
    );
  }
}

class _CardSlot extends InheritedWidget {
  final BorderRadius radius;

  const _CardSlot({required this.radius, required super.child});

  @override
  bool updateShouldNotify(_CardSlot old) => old.radius != radius;
}

/// Fila de pílulas: a seleccionada fica com a cor principal e cantos mais
/// fechados (a forma muda com mola).
class PillTabs extends StatelessWidget {
  final List<String> labels;
  final int selected;
  final ValueChanged<int> onSelected;
  final Map<int, int> badges;

  const PillTabs({
    super.key,
    required this.labels,
    required this.selected,
    required this.onSelected,
    this.badges = const {},
  });

  @override
  Widget build(BuildContext context) {
    final duration = AppMotion.of(context, AppMotion.medium);
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (var i = 0; i < labels.length; i++)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: Semantics(
                selected: i == selected,
                button: true,
                child: TweenAnimationBuilder<double>(
                  tween: Tween(end: i == selected ? 1 : 0),
                  duration: duration,
                  curve: AppMotion.spatial,
                  builder: (context, t, _) {
                    final k = t.clamp(0.0, 1.0);
                    final radius = BorderRadius.circular(20 - 8 * k);
                    return Material(
                      color: Color.lerp(
                        AppColors.textSecondary.withValues(alpha: 0.08),
                        AppColors.primary,
                        k,
                      ),
                      borderRadius: radius,
                      child: InkWell(
                        borderRadius: radius,
                        onTap: () => onSelected(i),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 18,
                            vertical: 9,
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                labels[i],
                                style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: i == selected
                                      ? FontWeight.w600
                                      : FontWeight.w400,
                                  color: Color.lerp(
                                    AppColors.textSecondary,
                                    AppColors.onPrimary,
                                    k,
                                  ),
                                ),
                              ),
                              if ((badges[i] ?? 0) > 0) ...[
                                const SizedBox(width: 6),
                                CountBadge(count: badges[i]!),
                              ],
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Bolinha vermelha com número.
class CountBadge extends StatelessWidget {
  final int count;

  const CountBadge({super.key, required this.count});

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minWidth: 18, minHeight: 18),
      padding: const EdgeInsets.symmetric(horizontal: 5),
      decoration: BoxDecoration(
        color: AppColors.error,
        borderRadius: BorderRadius.circular(9),
      ),
      alignment: Alignment.center,
      child: Text(
        count > 99 ? '99+' : '$count',
        style: const TextStyle(
          color: Colors.white,
          fontSize: 10,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

/// Estado vazio: ícone esbatido e uma frase.
class EmptyHint extends StatelessWidget {
  final IconData icon;
  final String message;
  final Widget? action;

  const EmptyHint({
    super.key,
    this.icon = LucideIcons.inbox,
    required this.message,
    this.action,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 48, horizontal: 24),
      child: Column(
        children: [
          Icon(icon, size: 48, color: AppColors.textSecondary.withValues(alpha: 0.4)),
          const SizedBox(height: 14),
          Text(
            message,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 14,
              height: 1.4,
              color: AppColors.textSecondary,
            ),
          ),
          if (action != null) ...[const SizedBox(height: 16), action!],
        ],
      ),
    );
  }
}

/// Ícone por nome de disciplina; o resto fica com o livro.
IconData subjectIcon(String name) {
  final n = name.toLowerCase();
  if (n.contains('mat')) return LucideIcons.sigma;
  if (n.contains('portug') || n.contains('líng') || n.contains('ling')) {
    return LucideIcons.languages;
  }
  if (n.contains('ingl') || n.contains('franc') || n.contains('english')) {
    return LucideIcons.messageSquare;
  }
  if (n.contains('ciên') || n.contains('cien') || n.contains('biol') || n.contains('scien')) {
    return LucideIcons.flaskConical;
  }
  if (n.contains('quím') || n.contains('quim')) return LucideIcons.beaker;
  if (n.contains('fís') || n.contains('fis') || n.contains('phys')) return LucideIcons.atom;
  if (n.contains('hist')) return LucideIcons.landmark;
  if (n.contains('geo')) return LucideIcons.globe;
  if (n.contains('educação física') || n.contains('desporto') || n.contains('sport')) {
    return LucideIcons.dumbbell;
  }
  if (n.contains('inform') || n.contains('tic') || n.contains('comput')) {
    return LucideIcons.monitor;
  }
  if (n.contains('art') || n.contains('desenho') || n.contains('music')) {
    return LucideIcons.palette;
  }
  return LucideIcons.bookOpen;
}

/// Cor estável por disciplina, para a mesma disciplina ter sempre o mesmo tom.
Color subjectColor(String key) {
  var h = 0;
  for (final c in key.codeUnits) {
    h = (h * 31 + c) & 0x7fffffff;
  }
  return AppColors.tileColors[h % AppColors.tileColors.length];
}
