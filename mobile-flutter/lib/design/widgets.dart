import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:fluentui_system_icons/fluentui_system_icons.dart';
import 'tokens.dart';

/// Cartão com borda fina e uma pequena resposta ao toque, sem sombras pesadas.
class SigaCard extends StatefulWidget {
  const SigaCard({
    super.key,
    required this.child,
    this.onTap,
    this.padding = const EdgeInsets.all(Siga.s2),
    this.color,
    this.semanticLabel,
  });
  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsetsGeometry padding;
  final Color? color;
  final String? semanticLabel;
  @override
  State<SigaCard> createState() => _SigaCardState();
}

class _SigaCardState extends State<SigaCard> {
  bool pressed = false;
  void press(bool value) {
    if (widget.onTap != null && pressed != value) {
      setState(() => pressed = value);
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = SigaPalette.of(context);
    final radius = BorderRadius.circular(Siga.rMedium);
    final card = Material(
      color: widget.color ?? Theme.of(context).colorScheme.surface,
      shape: RoundedRectangleBorder(
        borderRadius: radius,
        side: BorderSide(color: palette.line),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: widget.onTap,
        onHighlightChanged: press,
        child: Padding(padding: widget.padding, child: widget.child),
      ),
    );
    return Semantics(
      label: widget.semanticLabel,
      button: widget.onTap != null,
      child: AnimatedScale(
        scale: pressed ? .985 : 1,
        duration: Siga.motion(context, Siga.quick),
        curve: Siga.ease,
        child: card,
      ),
    );
  }
}

/// Ícone monocromático num mosaico suave.
class IconBadge extends StatelessWidget {
  const IconBadge(this.icon, {super.key, this.size = 44, this.accent = false});
  final IconData icon;
  final double size;
  final bool accent;
  @override
  Widget build(BuildContext context) {
    final palette = SigaPalette.of(context);
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: accent ? palette.accentSoft : palette.surface2,
        borderRadius: BorderRadius.circular(size * .3),
      ),
      child: Icon(
        icon,
        size: size * .5,
        color: accent ? scheme.primary : scheme.onSurface,
      ),
    );
  }
}

/// Título de secção com acção opcional («Ver todas»).
class SectionHeader extends StatelessWidget {
  const SectionHeader(this.title, {super.key, this.action, this.onAction});
  final String title;
  final String? action;
  final VoidCallback? onAction;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: Siga.s3, bottom: Siga.s1),
    child: Row(
      children: [
        Expanded(
          child: Semantics(
            header: true,
            child: Text(title, style: Theme.of(context).textTheme.titleMedium),
          ),
        ),
        if (action != null && onAction != null)
          TextButton(
            onPressed: onAction,
            style: TextButton.styleFrom(
              visualDensity: VisualDensity.compact,
              textStyle: const TextStyle(fontWeight: FontWeight.w600),
            ),
            child: Text(action!),
          ),
      ],
    ),
  );
}

/// Mosaico de serviço: ícone sobre o nome, numa grelha de três.
class ServiceTile extends StatefulWidget {
  const ServiceTile({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  State<ServiceTile> createState() => _ServiceTileState();
}

class _ServiceTileState extends State<ServiceTile> {
  bool pressed = false;
  @override
  Widget build(BuildContext context) {
    final palette = SigaPalette.of(context);
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      button: true,
      label: widget.label,
      excludeSemantics: true,
      child: AnimatedScale(
        scale: pressed ? .96 : 1,
        duration: Siga.motion(context, Siga.quick),
        curve: Siga.ease,
        child: Material(
          color: palette.surface2,
          borderRadius: BorderRadius.circular(18),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: widget.onTap,
            onHighlightChanged: (value) => setState(() => pressed = value),
            child: Padding(
              padding: const EdgeInsets.symmetric(
                vertical: Siga.s2,
                horizontal: Siga.s1,
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(widget.icon, size: 28, color: scheme.onSurface),
                  const SizedBox(height: 12),
                  // Encolhe o rótulo em vez de o cortar («Aulas online»).
                  FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(
                      widget.label,
                      maxLines: 1,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w500,
                        color: scheme.onSurface,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Grelha de serviços com três colunas (duas em ecrãs muito estreitos).
class ServiceGrid extends StatelessWidget {
  const ServiceGrid({super.key, required this.children});
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final columns = constraints.maxWidth < 300 ? 2 : 3;
      const gap = 12.0;
      final width = (constraints.maxWidth - gap * (columns - 1)) / columns;
      // Proporção da referência (larga), mas nunca mais baixo do que o
      // ícone e o nome precisam (também com texto ampliado).
      final scale = MediaQuery.textScalerOf(context).scale(15) / 15;
      final height = (width / 1.42).clamp(96.0 * scale, double.infinity);
      return GridView.count(
        // Sem herdar o recuo da barra inferior: a grelha está dentro da lista.
        padding: EdgeInsets.zero,
        crossAxisCount: columns,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        mainAxisSpacing: gap,
        crossAxisSpacing: gap,
        childAspectRatio: width / height,
        children: children,
      );
    },
  );
}

/// Etiqueta de estado discreta («Simulação», «Por activar»).
class StatusTag extends StatelessWidget {
  const StatusTag(this.label, {super.key, this.accent = false});
  final String label;
  final bool accent;
  @override
  Widget build(BuildContext context) {
    final palette = SigaPalette.of(context);
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: accent ? palette.accentSoft : palette.surface2,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: accent ? scheme.primary : palette.ink2,
        ),
      ),
    );
  }
}

/// Estado vazio ou de erro: ícone, mensagem e uma acção opcional.
class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.message,
    this.icon = FluentIcons.mail_inbox_24_regular,
    this.action,
    this.onAction,
  });
  final String message;
  final IconData icon;
  final String? action;
  final VoidCallback? onAction;
  @override
  Widget build(BuildContext context) {
    final palette = SigaPalette.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: Siga.s3),
      child: Column(
        children: [
          Icon(icon, size: 28, color: palette.ink2),
          const SizedBox(height: Siga.s1),
          Text(
            message,
            textAlign: TextAlign.center,
            style: TextStyle(color: palette.ink2),
          ),
          if (action != null && onAction != null) ...[
            const SizedBox(height: Siga.s2),
            FilledButton.tonal(onPressed: onAction, child: Text(action!)),
          ],
        ],
      ),
    );
  }
}

/// Avatar por iniciais: nenhuma fotografia é inventada.
class InitialsAvatar extends StatelessWidget {
  const InitialsAvatar(this.name, {super.key, this.size = 48});
  final String name;
  final double size;

  static String initials(String name) {
    // Títulos abreviados («Prof.», «Dr.») não contam como nome.
    final parts = name
        .trim()
        .split(RegExp(r'\s+'))
        .where((p) => p.isNotEmpty && !p.endsWith('.'))
        .toList();
    if (parts.isEmpty) return 'S';
    final first = parts.first.characters.first;
    final last = parts.length > 1 ? parts.last.characters.first : '';
    return (first + last).toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final palette = SigaPalette.of(context);
    return ExcludeSemantics(
      child: Container(
        width: size,
        height: size,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: palette.accentSoft,
          shape: BoxShape.circle,
        ),
        child: Text(
          initials(name),
          style: TextStyle(
            fontSize: size * .36,
            fontWeight: FontWeight.w700,
            color: Theme.of(context).colorScheme.primary,
          ),
        ),
      ),
    );
  }
}

/// Painel inferior com escurecimento discreto e cantos arredondados.
Future<T?> showSigaSheet<T>(
  BuildContext context, {
  required String title,
  required Widget Function(BuildContext context) builder,
}) => showModalBottomSheet<T>(
  context: context,
  isScrollControlled: true,
  useSafeArea: true,
  builder: (context) => ConstrainedBox(
    constraints: BoxConstraints(
      maxHeight: MediaQuery.sizeOf(context).height * .85,
    ),
    child: SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(Siga.s3, 0, Siga.s3, Siga.s3),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            header: true,
            child: Text(title, style: Theme.of(context).textTheme.titleLarge),
          ),
          const SizedBox(height: Siga.s2),
          builder(context),
        ],
      ),
    ),
  ),
);

/// Linha de menu com ícone, título, subtítulo e seta.
class MenuRow extends StatelessWidget {
  const MenuRow({
    super.key,
    required this.icon,
    required this.title,
    this.subtitle,
    this.onTap,
    this.trailing,
    this.destructive = false,
    this.color,
  });
  final IconData icon;
  final String title;
  final String? subtitle;
  final VoidCallback? onTap;
  final Widget? trailing;
  final bool destructive;

  /// Cor do ícone (ex.: estado de presença); o texto mantém-se neutro.
  final Color? color;
  @override
  Widget build(BuildContext context) {
    final color = destructive ? Theme.of(context).colorScheme.error : null;
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: Siga.s1),
      minVerticalPadding: 12,
      leading: Icon(icon, color: color ?? this.color),
      title: Text(
        title,
        style: TextStyle(fontWeight: FontWeight.w500, color: color),
      ),
      subtitle: subtitle == null ? null : Text(subtitle!),
      trailing:
          trailing ??
          (onTap == null || destructive
              ? null
              : const Icon(FluentIcons.chevron_right_24_regular, size: 20)),
      onTap: onTap,
    );
  }
}

/// Selector em cápsulas (ecrãs 8–10): a opção activa em azul, as outras em
/// cinzento claro; [expanded] reparte a largura (Agenda / Horários).
class Segmented extends StatelessWidget {
  const Segmented({
    super.key,
    required this.options,
    required this.selected,
    required this.onSelected,
    this.expanded = false,
    this.badges = const {},
  });
  final List<String> options;
  final int selected;
  final ValueChanged<int> onSelected;
  final bool expanded;

  /// Número a mostrar num ponto vermelho ao lado da opção (ex.: «Não lidas»).
  final Map<int, int> badges;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final palette = SigaPalette.of(context);
    Widget pill(int i) {
      final active = i == selected;
      return Semantics(
        button: true,
        selected: active,
        label: options[i],
        excludeSemantics: true,
        child: GestureDetector(
          onTap: () {
            if (i != selected) HapticFeedback.selectionClick();
            onSelected(i);
          },
          child: AnimatedContainer(
            duration: Siga.motion(context, Siga.quick),
            curve: Siga.ease,
            height: 34,
            padding: const EdgeInsets.symmetric(horizontal: Siga.s2),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: active ? scheme.primary : palette.surface2,
              borderRadius: BorderRadius.circular(17),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  options[i],
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: active ? FontWeight.w600 : FontWeight.w500,
                    color: active ? Colors.white : palette.ink2,
                  ),
                ),
                if ((badges[i] ?? 0) > 0) ...[
                  const SizedBox(width: 6),
                  Container(
                    constraints: const BoxConstraints(minWidth: 16),
                    height: 16,
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: const Color(0xffff3b4e),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      '${badges[i]}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      );
    }

    if (expanded) {
      return Container(
        padding: const EdgeInsets.all(3),
        decoration: BoxDecoration(
          color: palette.surface2,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(
          children: [
            for (var i = 0; i < options.length; i++) Expanded(child: pill(i)),
          ],
        ),
      );
    }
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (var i = 0; i < options.length; i++)
            Padding(
              padding: const EdgeInsets.only(right: Siga.s1),
              child: pill(i),
            ),
        ],
      ),
    );
  }
}

/// Ícone numa cor, sobre um fundo suave da mesma cor (disciplinas, menus).
class TintIcon extends StatelessWidget {
  const TintIcon(this.icon, {super.key, required this.color, this.size = 48});
  final IconData icon;
  final Color color;
  final double size;
  @override
  Widget build(BuildContext context) => Container(
    width: size,
    height: size,
    decoration: BoxDecoration(
      color: color.withValues(alpha: .12),
      borderRadius: BorderRadius.circular(size * .3),
    ),
    child: Icon(icon, color: color, size: size * .5),
  );
}

/// Entrada suave do conteúdo: cada bloco aparece e sobe 10 px, um pouco
/// depois do anterior (até ao oitavo). Corre uma vez; com «Reduzir
/// movimentos» o conteúdo aparece logo.
class Entrance extends StatelessWidget {
  const Entrance({super.key, required this.index, required this.child});
  final int index;
  final Widget child;
  @override
  Widget build(BuildContext context) {
    final delay = 45 * index.clamp(0, 8);
    final total = Siga.motion(
      context,
      Duration(milliseconds: Siga.medium.inMilliseconds + delay),
    );
    if (total == Duration.zero) return child;
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: total,
      curve: Interval(delay / total.inMilliseconds, 1, curve: Siga.ease),
      child: child,
      builder: (context, t, child) => Opacity(
        opacity: t,
        child: Transform.translate(
          offset: Offset(0, 10 * (1 - t)),
          child: child,
        ),
      ),
    );
  }
}

/// Novidades reais vindas do SIGA (avisos e conversas por ler) e como pedir
/// nova contagem depois de uma acção (ler um aviso, sair das mensagens).
class ActivityScope extends InheritedWidget {
  const ActivityScope({
    super.key,
    required this.unreadNotices,
    required this.unreadChats,
    required this.refresh,
    required super.child,
  });
  final bool unreadNotices;
  final bool unreadChats;
  final VoidCallback refresh;

  static ActivityScope? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<ActivityScope>();

  @override
  bool updateShouldNotify(ActivityScope old) =>
      old.unreadNotices != unreadNotices || old.unreadChats != unreadChats;
}

/// Sino dos avisos com ponto vermelho quando há avisos por ler no SIGA.
class NoticeBell extends StatelessWidget {
  const NoticeBell({super.key, required this.icon, required this.onPressed});
  final IconData icon;
  final VoidCallback onPressed;
  @override
  Widget build(BuildContext context) {
    final unread = ActivityScope.maybeOf(context)?.unreadNotices ?? false;
    return IconButton(
      tooltip: unread ? 'Avisos, há avisos por ler' : 'Avisos',
      onPressed: onPressed,
      icon: Stack(
        clipBehavior: Clip.none,
        children: [
          Icon(icon),
          Positioned(
            top: -1,
            right: -1,
            child: AnimatedScale(
              scale: unread ? 1 : 0,
              duration: Siga.motion(context, Siga.quick),
              curve: Siga.ease,
              child: Container(
                width: 9,
                height: 9,
                decoration: BoxDecoration(
                  color: const Color(0xffd92c3a),
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: Theme.of(context).colorScheme.surface,
                    width: 1.5,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
