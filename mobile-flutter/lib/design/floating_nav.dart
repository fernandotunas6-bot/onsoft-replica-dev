import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'tokens.dart';

class NavItem {
  const NavItem(this.icon, this.selectedIcon, this.label);
  final IconData icon;
  final IconData selectedIcon;
  final String label;
}

/// Barra inferior dos ecrãs 7–10: branca, com borda fina no topo, ícone e
/// nome; o separador activo fica azul (cor principal) e o ícone muda para a
/// versão cheia com uma transição curta.
class FloatingNavBar extends StatelessWidget {
  const FloatingNavBar({
    super.key,
    required this.items,
    required this.index,
    required this.onSelected,
  });
  final List<NavItem> items;
  final int index;
  final ValueChanged<int> onSelected;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final palette = SigaPalette.of(context);
    final duration = Siga.motion(context, Siga.quick);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: scheme.surface,
        border: Border(top: BorderSide(color: palette.line)),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 64,
          child: Row(
            children: [
              for (var i = 0; i < items.length; i++)
                Expanded(
                  child: _NavButton(
                    item: items[i],
                    selected: i == index,
                    duration: duration,
                    onTap: () {
                      if (i != index) HapticFeedback.selectionClick();
                      onSelected(i);
                    },
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NavButton extends StatelessWidget {
  const _NavButton({
    required this.item,
    required this.selected,
    required this.duration,
    required this.onTap,
  });
  final NavItem item;
  final bool selected;
  final Duration duration;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final color = selected ? scheme.primary : scheme.onSurfaceVariant;
    return Semantics(
      button: true,
      selected: selected,
      label: item.label,
      excludeSemantics: true,
      // Sem ondulação: a resposta é a troca animada do ícone e o toque háptico.
      child: InkResponse(
        onTap: onTap,
        splashFactory: NoSplash.splashFactory,
        highlightColor: Colors.transparent,
        hoverColor: Colors.transparent,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            AnimatedSwitcher(
              duration: duration,
              transitionBuilder: (child, animation) =>
                  ScaleTransition(scale: animation, child: child),
              child: Icon(
                selected ? item.selectedIcon : item.icon,
                key: ValueKey(selected),
                color: color,
                size: 23,
              ),
            ),
            const SizedBox(height: 4),
            AnimatedDefaultTextStyle(
              duration: duration,
              style: TextStyle(
                fontFamily: 'Inter',
                fontSize: 11,
                fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
                color: color,
              ),
              child: Text(
                item.label,
                maxLines: 1,
                overflow: TextOverflow.fade,
                softWrap: false,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Conteúdo dos separadores com «fade through»: ao trocar de separador, o
/// novo aparece e cresce de 98 % para 100 %. Mantém o estado de cada
/// separador (IndexedStack); sem animação com «Reduzir movimentos».
class FadeThroughStack extends StatefulWidget {
  const FadeThroughStack({
    super.key,
    required this.index,
    required this.children,
  });
  final int index;
  final List<Widget> children;
  @override
  State<FadeThroughStack> createState() => _FadeThroughStackState();
}

class _FadeThroughStackState extends State<FadeThroughStack>
    with SingleTickerProviderStateMixin {
  late final AnimationController motion = AnimationController(
    vsync: this,
    duration: Siga.medium,
    value: 1,
  );

  @override
  void didUpdateWidget(FadeThroughStack old) {
    super.didUpdateWidget(old);
    if (old.index != widget.index) {
      motion.duration = Siga.motion(context, Siga.medium);
      motion.forward(from: motion.duration == Duration.zero ? 1 : 0);
    }
  }

  @override
  void dispose() {
    motion.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final curve = CurvedAnimation(parent: motion, curve: Siga.ease);
    return FadeTransition(
      opacity: curve,
      child: ScaleTransition(
        scale: Tween<double>(begin: .98, end: 1).animate(curve),
        child: IndexedStack(index: widget.index, children: widget.children),
      ),
    );
  }
}
