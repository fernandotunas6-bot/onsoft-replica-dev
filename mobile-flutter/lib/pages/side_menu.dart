import 'package:flutter/material.dart';
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
    IconData i(IconData outlined, IconData modern) =>
        AppearanceScope.icon(context, outlined, modern);
    void go(String path) {
      Navigator.of(context).pop();
      onNavigate(path);
    }

    final items = [
      (
        'Meu perfil',
        i(Icons.person_outline, Icons.person_rounded),
        '/more/profile',
      ),
      (
        'Notas',
        i(Icons.info_outline, Icons.info_rounded),
        student ? '/more/results' : '/more/student-only',
      ),
      (
        'Faltas',
        i(Icons.schedule_outlined, Icons.schedule_rounded),
        '/more/absences',
      ),
      (
        'Propinas',
        i(Icons.monetization_on_outlined, Icons.monetization_on_rounded),
        student ? '/more/finance' : '/more/student-only',
      ),
      (
        'Recibos',
        i(Icons.receipt_long_outlined, Icons.receipt_long_rounded),
        student ? '/more/finance' : '/more/student-only',
      ),
      (
        'Biblioteca',
        i(Icons.menu_book_outlined, Icons.menu_book_rounded),
        '/more/library',
      ),
      (
        'Documentos',
        i(Icons.description_outlined, Icons.description_rounded),
        student ? '/more/documents' : '/more/student-only',
      ),
      (
        'Definições',
        i(Icons.settings_outlined, Icons.settings_rounded),
        '/more/appearance',
      ),
    ];
    return Drawer(
      width: 300,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.horizontal(right: Radius.circular(20)),
      ),
      child: SafeArea(
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
              icon: i(Icons.dark_mode_outlined, Icons.dark_mode_rounded),
              title: 'Modo escuro',
              trailing: Switch(value: dark, onChanged: onDark),
              onTap: () => onDark(!dark),
            ),
            const SizedBox(height: Siga.s2),
            MenuRow(
              icon: Icons.logout,
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
    );
  }
}
