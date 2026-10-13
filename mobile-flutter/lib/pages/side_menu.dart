import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../design/tokens.dart';
import '../design/widgets.dart';

/// Menu lateral (ecrã 11): perfil no topo, as consultas pessoais, definições,
/// modo escuro e sair. Abre a partir do avatar do início ou do mosaico «Mais».
class SideMenu extends StatelessWidget {
  const SideMenu({
    super.key,
    required this.name,
    required this.subtitle,
    required this.student,
    required this.dark,
    required this.onDark,
    required this.onNavigate,
    required this.onSwitchSchool,
    required this.onSignOut,
  });
  final String name;
  final String subtitle;
  final bool student;
  final bool dark;
  final ValueChanged<bool> onDark;
  final ValueChanged<String> onNavigate;
  final VoidCallback onSwitchSchool;
  final VoidCallback onSignOut;

  @override
  Widget build(BuildContext context) {
    final palette = SigaPalette.of(context);
    IconData i(IconData line, IconData classic) =>
        AppearanceScope.icon(context, line, classic);
    void go(String path) {
      Navigator.of(context).pop();
      onNavigate(path);
    }

    final items = [
      (
        'Meu perfil',
        i(LucideIcons.user, Icons.person_rounded),
        '/more/profile',
      ),
      (
        'Notas',
        i(LucideIcons.info, Icons.info_rounded),
        student ? '/more/results' : '/more/student-only',
      ),
      (
        'Faltas',
        i(LucideIcons.clock, Icons.schedule_rounded),
        '/more/absences',
      ),
      (
        'Propinas',
        i(LucideIcons.circleDollarSign, Icons.monetization_on_rounded),
        student ? '/more/finance' : '/more/student-only',
      ),
      (
        'Recibos',
        i(LucideIcons.receipt, Icons.receipt_long_rounded),
        student ? '/more/finance' : '/more/student-only',
      ),
      (
        'Biblioteca',
        i(LucideIcons.bookOpen, Icons.menu_book_rounded),
        '/more/library',
      ),
      (
        'Documentos',
        i(LucideIcons.fileText, Icons.description_rounded),
        student ? '/more/documents' : '/more/student-only',
      ),
      (
        'Definições',
        i(LucideIcons.settings, Icons.settings_rounded),
        '/more/appearance',
      ),
    ];
    // Cartão flutuante com cantos redondos, afastado das margens (ecrã 11).
    return Drawer(
      width: 300,
      backgroundColor: Colors.transparent,
      elevation: 0,
      shape: const RoundedRectangleBorder(),
      child: SafeArea(
        minimum: const EdgeInsets.all(12),
        child: Material(
          color: Theme.of(context).colorScheme.surface,
          elevation: 8,
          shadowColor: const Color(0x33000000),
          borderRadius: BorderRadius.circular(24),
          clipBehavior: Clip.antiAlias,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(
              Siga.s2,
              Siga.s2,
              Siga.s2,
              Siga.s3,
            ),
            children: [
              Semantics(
                button: true,
                label: '$name, $subtitle. Mudar de escola',
                excludeSemantics: true,
                child: InkWell(
                  borderRadius: BorderRadius.circular(Siga.rMedium),
                  onTap: () {
                    Navigator.of(context).pop();
                    onSwitchSchool();
                  },
                  child: Padding(
                    padding: const EdgeInsets.all(Siga.s1),
                    child: Row(
                      children: [
                        InitialsAvatar(name, size: 48),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                name,
                                style: const TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              Text(
                                subtitle,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: 12,
                                  color: palette.ink2,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(height: Siga.s2),
              for (final (label, icon, path) in items)
                MenuRow(icon: icon, title: label, onTap: () => go(path)),
              const SizedBox(height: Siga.s1),
              MenuRow(
                icon: i(LucideIcons.moon, Icons.dark_mode_rounded),
                title: 'Modo escuro',
                trailing: Switch(value: dark, onChanged: onDark),
                onTap: () => onDark(!dark),
              ),
              const SizedBox(height: Siga.s2),
              MenuRow(
                icon: LucideIcons.logOut,
                title: 'Sair',
                destructive: true,
                onTap: () {
                  Navigator.of(context).pop();
                  onSignOut();
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}
