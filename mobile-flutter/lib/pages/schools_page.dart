import 'package:flutter/material.dart';
import '../design/tokens.dart';
import '../design/widgets.dart';

/// Uma escola e um perfil em que o utilizador pode entrar.
class SchoolChoice {
  const SchoolChoice({
    required this.schoolId,
    required this.schoolName,
    required this.role,
  });
  final String schoolId;
  final String schoolName;
  final String role;

  String get roleLabel => role == 'professor' ? 'Professor' : 'Aluno';

  /// Vínculos activos da sessão, um por escola e perfil (aluno/professor).
  static List<SchoolChoice> fromSession(Map<String, dynamic>? session) => [
    for (final m in (session?['memberships'] as List? ?? []))
      if (m is Map &&
          m['active'] == true &&
          m['schoolId'] is String &&
          m['schoolName'] is String)
        for (final role in (m['roles'] as List? ?? []))
          if (role == 'aluno' || role == 'professor')
            SchoolChoice(
              schoolId: m['schoolId'] as String,
              schoolName: m['schoolName'] as String,
              role: role as String,
            ),
  ];
}

/// Selector de escola: multi-tenant, com pesquisa quando há muitas escolas.
class SchoolsPage extends StatefulWidget {
  const SchoolsPage({
    super.key,
    required this.choices,
    required this.onSelect,
    required this.onSignOut,
    required this.onRetry,
    this.error,
  });
  final List<SchoolChoice> choices;
  final ValueChanged<SchoolChoice> onSelect;
  final VoidCallback onSignOut;
  final VoidCallback onRetry;
  final String? error;
  @override
  State<SchoolsPage> createState() => _SchoolsPageState();
}

class _SchoolsPageState extends State<SchoolsPage> {
  String query = '';

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final shown = widget.choices
        .where((c) => c.schoolName.toLowerCase().contains(query))
        .toList();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Seleccione a sua escola'),
        actions: [
          IconButton(
            tooltip: 'Sair',
            onPressed: widget.onSignOut,
            icon: const Icon(Icons.logout_outlined),
          ),
        ],
      ),
      body: Align(
        alignment: Alignment.topCenter,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 560),
          child: ListView(
            padding: const EdgeInsets.all(Siga.s3),
            children: [
              if (widget.error != null)
                EmptyState(
                  icon: Icons.cloud_off_outlined,
                  message: widget.error!,
                  action: 'Tentar novamente',
                  onAction: widget.onRetry,
                ),
              if (widget.choices.length > 4) ...[
                TextField(
                  decoration: const InputDecoration(
                    hintText: 'Pesquisar escola…',
                    prefixIcon: Icon(Icons.search),
                  ),
                  onChanged: (value) =>
                      setState(() => query = value.trim().toLowerCase()),
                ),
                const SizedBox(height: Siga.s2),
              ],
              for (final choice in shown)
                Padding(
                  padding: const EdgeInsets.only(bottom: Siga.s1),
                  child: SigaCard(
                    onTap: () => widget.onSelect(choice),
                    semanticLabel: '${choice.schoolName}, ${choice.roleLabel}',
                    child: Row(
                      children: [
                        _SchoolBadge(choice.schoolName),
                        const SizedBox(width: Siga.s2),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                choice.schoolName,
                                style: theme.textTheme.titleMedium,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                              Text(
                                choice.roleLabel,
                                style: theme.textTheme.bodySmall,
                              ),
                            ],
                          ),
                        ),
                        const Icon(Icons.chevron_right, size: 20),
                      ],
                    ),
                  ),
                ),
              if (widget.error == null && widget.choices.isEmpty)
                SigaCard(
                  child: Row(
                    children: [
                      const IconBadge(Icons.cloud_outlined),
                      const SizedBox(width: Siga.s2),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Sem escola por enquanto',
                              style: theme.textTheme.titleMedium,
                            ),
                            Text(
                              'Peça à secretaria da escola o vínculo à sua '
                              'conta. Depois volte a entrar.',
                              style: theme.textTheme.bodySmall,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              if (widget.choices.isNotEmpty && shown.isEmpty)
                const EmptyState(message: 'Nenhuma escola com esse nome.'),
            ],
          ),
        ),
      ),
    );
  }
}

class _SchoolBadge extends StatelessWidget {
  const _SchoolBadge(this.name);
  final String name;
  @override
  Widget build(BuildContext context) {
    final palette = SigaPalette.of(context);
    final letter = name.trim().isEmpty
        ? 'S'
        : name.trim().characters.first.toUpperCase();
    return Container(
      width: 48,
      height: 48,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: palette.surface2,
        borderRadius: BorderRadius.circular(Siga.rSmall),
      ),
      child: Text(
        letter,
        style: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.w700,
          color: palette.ink2,
        ),
      ),
    );
  }
}
