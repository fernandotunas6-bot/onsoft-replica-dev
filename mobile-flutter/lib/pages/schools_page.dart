import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../design/tokens.dart';
import '../design/widgets.dart';

/// Uma escola e um perfil em que o utilizador pode entrar.
class SchoolChoice {
  const SchoolChoice({
    required this.schoolId,
    required this.schoolName,
    required this.role,
    this.logoUrl,
  });
  final String schoolId;
  final String schoolName;
  final String role;
  final String? logoUrl;

  String get roleLabel => roleName(role);

  static String roleName(String role) =>
      role == 'professor' ? 'Professor' : 'Aluno';

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
              logoUrl:
                  m['schoolLogoUrl'] is String &&
                      (m['schoolLogoUrl'] as String).startsWith('https://')
                  ? m['schoolLogoUrl'] as String
                  : null,
            ),
  ];
}

/// Escolha da escola (ecrã 6): painel inferior sobre o fundo escurecido, uma
/// linha por escola com os perfis do utilizador nessa escola.
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

  /// Escolas pela ordem em que chegam, cada uma com os seus perfis.
  List<List<SchoolChoice>> get schools {
    final grouped = <String, List<SchoolChoice>>{};
    for (final c in widget.choices) {
      (grouped[c.schoolId] ??= []).add(c);
    }
    return grouped.values
        .where((g) => g.first.schoolName.toLowerCase().contains(query))
        .toList();
  }

  void open(List<SchoolChoice> school) {
    if (school.length == 1) return widget.onSelect(school.first);
    showSigaSheet<void>(
      context,
      title: school.first.schoolName,
      builder: (sheet) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Entrar como:'),
          const SizedBox(height: Siga.s1),
          for (final choice in school)
            MenuRow(
              icon: choice.role == 'professor'
                  ? LucideIcons.presentation
                  : LucideIcons.user,
              title: choice.roleLabel,
              onTap: () {
                Navigator.of(sheet).pop();
                widget.onSelect(choice);
              },
            ),
        ],
      ),
    );
  }

  void requestLink() => showSigaSheet<void>(
    context,
    title: 'Solicitar vínculo',
    builder: (_) => const Text(
      'O vínculo à escola é criado pela secretaria. Peça-o na escola com o '
      'e-mail desta conta; depois volte a entrar e a escola aparece aqui.',
    ),
  );

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final palette = SigaPalette.of(context);
    final shown = schools;
    return Scaffold(
      backgroundColor: const Color(0xff9a9ca3),
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            Align(
              alignment: Alignment.centerRight,
              child: IconButton(
                tooltip: 'Sair',
                color: Colors.white,
                onPressed: widget.onSignOut,
                icon: const Icon(LucideIcons.logOut),
              ),
            ),
            Expanded(
              child: Container(
                width: double.infinity,
                constraints: const BoxConstraints(maxWidth: 560),
                decoration: BoxDecoration(
                  color: theme.colorScheme.surface,
                  borderRadius: const BorderRadius.vertical(
                    top: Radius.circular(Siga.rLarge),
                  ),
                ),
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(
                    Siga.s2,
                    12,
                    Siga.s2,
                    Siga.s3,
                  ),
                  children: [
                    Center(
                      child: Container(
                        width: 40,
                        height: 4,
                        decoration: BoxDecoration(
                          color: palette.line,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),
                    const SizedBox(height: Siga.s3),
                    Semantics(
                      header: true,
                      child: Text(
                        'Seleccione a sua escola',
                        style: theme.textTheme.titleLarge,
                      ),
                    ),
                    const SizedBox(height: Siga.s2),
                    TextField(
                      decoration: InputDecoration(
                        hintText: 'Pesquisar escola…',
                        prefixIcon: const Icon(LucideIcons.search, size: 20),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(24),
                          borderSide: BorderSide.none,
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(24),
                          borderSide: BorderSide.none,
                        ),
                      ),
                      onChanged: (value) =>
                          setState(() => query = value.trim().toLowerCase()),
                    ),
                    const SizedBox(height: Siga.s2),
                    if (widget.error != null)
                      EmptyState(
                        icon: LucideIcons.cloudOff,
                        message: widget.error!,
                        action: 'Tentar novamente',
                        onAction: widget.onRetry,
                      ),
                    for (final school in shown)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: SigaCard(
                          onTap: () => open(school),
                          padding: const EdgeInsets.all(12),
                          semanticLabel: school.first.schoolName,
                          child: Row(
                            children: [
                              _SchoolLogo(school.first),
                              const SizedBox(width: 14),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      school.first.schoolName,
                                      style: const TextStyle(
                                        fontSize: 15,
                                        fontWeight: FontWeight.w600,
                                      ),
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      school.map((c) => c.roleLabel).join(', '),
                                      style: theme.textTheme.bodySmall,
                                    ),
                                  ],
                                ),
                              ),
                              const Icon(LucideIcons.chevronRight, size: 20),
                            ],
                          ),
                        ),
                      ),
                    if (widget.choices.isNotEmpty && shown.isEmpty)
                      const EmptyState(
                        message: 'Nenhuma escola com esse nome.',
                      ),
                    if (widget.error == null)
                      SigaCard(
                        onTap: requestLink,
                        padding: const EdgeInsets.all(12),
                        child: Row(
                          children: [
                            Container(
                              width: 48,
                              height: 48,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                border: Border.all(color: palette.line),
                              ),
                              child: const Icon(LucideIcons.cloud, size: 22),
                            ),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text(
                                    'Sem escola por enquanto',
                                    style: TextStyle(
                                      fontSize: 15,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                  Text(
                                    'Solicitar vínculo',
                                    style: theme.textTheme.bodySmall,
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Logótipo da escola quando o servidor o fornece; senão, a inicial.
class _SchoolLogo extends StatelessWidget {
  const _SchoolLogo(this.choice);
  final SchoolChoice choice;
  @override
  Widget build(BuildContext context) {
    final palette = SigaPalette.of(context);
    final name = choice.schoolName.trim();
    final initial = Container(
      width: 48,
      height: 48,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: palette.surface2,
        borderRadius: BorderRadius.circular(Siga.rSmall),
      ),
      child: Text(
        name.isEmpty ? 'S' : name.characters.first.toUpperCase(),
        style: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.w700,
          color: palette.ink2,
        ),
      ),
    );
    final url = choice.logoUrl;
    if (url == null) return initial;
    return ClipRRect(
      borderRadius: BorderRadius.circular(Siga.rSmall),
      child: Image.network(
        url,
        width: 48,
        height: 48,
        fit: BoxFit.contain,
        errorBuilder: (_, _, _) => initial,
      ),
    );
  }
}
