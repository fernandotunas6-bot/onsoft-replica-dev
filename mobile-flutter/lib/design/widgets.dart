import 'package:flutter/material.dart';
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
          borderRadius: BorderRadius.circular(Siga.rMedium),
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
                  Icon(widget.icon, size: 26),
                  const SizedBox(height: 10),
                  Text(
                    widget.label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: Theme.of(context).colorScheme.onSurface,
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
      return GridView.count(
        // Sem herdar o recuo da barra flutuante: a grelha está dentro da lista.
        padding: EdgeInsets.zero,
        crossAxisCount: columns,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        mainAxisSpacing: 10,
        crossAxisSpacing: 10,
        childAspectRatio: 1.12,
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
    this.icon = Icons.inbox_outlined,
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
  });
  final IconData icon;
  final String title;
  final String? subtitle;
  final VoidCallback? onTap;
  final Widget? trailing;
  final bool destructive;
  @override
  Widget build(BuildContext context) {
    final color = destructive ? Theme.of(context).colorScheme.error : null;
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: Siga.s1),
      minVerticalPadding: 12,
      leading: Icon(icon, color: color),
      title: Text(
        title,
        style: TextStyle(fontWeight: FontWeight.w500, color: color),
      ),
      subtitle: subtitle == null ? null : Text(subtitle!),
      trailing:
          trailing ??
          (onTap == null || destructive
              ? null
              : const Icon(Icons.chevron_right, size: 20)),
      onTap: onTap,
    );
  }
}
