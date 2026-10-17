import 'package:flutter/material.dart';
import 'package:fluentui_system_icons/fluentui_system_icons.dart';
import '../design/tokens.dart';
import '../design/widgets.dart';
import 'schools_page.dart' show SchoolChoice;

/// Meu perfil: quem está na sessão, em que escola e com que perfil, e todos
/// os vínculos activos no SIGA. Os dados pessoais são da secretaria; aqui só
/// se consultam.
class ProfilePage extends StatelessWidget {
  const ProfilePage({
    super.key,
    required this.name,
    required this.schoolId,
    required this.role,
    required this.memberships,
    required this.onNavigate,
    required this.onSwitchSchool,
    required this.onSignOut,
  });
  final String name;
  final String? schoolId;
  final String? role;
  final List<SchoolChoice> memberships;
  final ValueChanged<String> onNavigate;
  final VoidCallback onSwitchSchool;
  final VoidCallback onSignOut;

  @override
  Widget build(BuildContext context) {
    final palette = SigaPalette.of(context);
    final schools = <String, List<SchoolChoice>>{};
    for (final m in memberships) {
      (schools[m.schoolId] ??= []).add(m);
    }
    final active = memberships.where(
      (m) => m.schoolId == schoolId && m.role == role,
    );
    final children = <Widget>[
      Center(child: InitialsAvatar(name, size: 84)),
      const SizedBox(height: Siga.s2),
      Text(
        name.isEmpty ? 'Utilizador SIGA' : name,
        textAlign: TextAlign.center,
        style: const TextStyle(
          fontSize: 22,
          fontWeight: FontWeight.w700,
          letterSpacing: -.3,
        ),
      ),
      if (active.isNotEmpty) ...[
        const SizedBox(height: 4),
        Text(
          '${active.first.roleLabel} · ${active.first.schoolName}',
          textAlign: TextAlign.center,
          style: TextStyle(color: palette.ink2),
        ),
      ],
      const SectionHeader('Escolas e perfis'),
      if (schools.isEmpty)
        const EmptyState(message: 'Sem vínculos activos nesta conta.'),
      for (final school in schools.values)
        Padding(
          padding: const EdgeInsets.only(bottom: Siga.s1),
          child: SigaCard(
            child: Row(
              children: [
                const IconBadge(FluentIcons.building_24_regular, size: 44),
                const SizedBox(width: Siga.s2),
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
                      ),
                      const SizedBox(height: 6),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          for (final m in school)
                            StatusTag(
                              m.schoolId == schoolId && m.role == role
                                  ? '${m.roleLabel} · activo'
                                  : m.roleLabel,
                              accent: m.schoolId == schoolId && m.role == role,
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      const SectionHeader('Conta'),
      MenuRow(
        icon: FluentIcons.arrow_swap_24_regular,
        title: 'Mudar de escola ou perfil',
        onTap: onSwitchSchool,
      ),
      MenuRow(
        icon: FluentIcons.paint_brush_24_regular,
        title: 'Aparência',
        onTap: () => onNavigate('/more/appearance'),
      ),
      MenuRow(
        icon: FluentIcons.sign_out_24_regular,
        title: 'Sair',
        destructive: true,
        onTap: onSignOut,
      ),
      const SizedBox(height: Siga.s2),
      Text(
        'Nome, contactos e dados de matrícula são geridos pela secretaria no '
        'SIGA. Para corrigir algum dado, contacte a escola.',
        style: TextStyle(fontSize: 12, color: palette.ink2),
      ),
    ];
    return ListView(
      padding: const EdgeInsets.fromLTRB(Siga.s3, Siga.s2, Siga.s3, Siga.s4),
      children: [
        for (final (i, child) in children.indexed)
          Entrance(index: i, child: child),
      ],
    );
  }
}
