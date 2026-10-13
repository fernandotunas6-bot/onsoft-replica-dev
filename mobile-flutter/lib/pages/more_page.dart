import 'package:flutter/material.dart';
import '../design/tokens.dart';
import '../design/widgets.dart';

/// «Mais»: perfil no topo e um só menu com os serviços que não cabem na barra
/// inferior. Sem entradas sem destino.
class MorePage extends StatelessWidget {
  const MorePage({
    super.key,
    required this.name,
    required this.roleLabel,
    required this.schoolName,
    this.student = false,
    required this.onNavigate,
    required this.onSwitchSchool,
    required this.onSignOut,
  });
  final String name;
  final String roleLabel;
  final String schoolName;
  final bool student;
  final ValueChanged<String> onNavigate;
  final VoidCallback onSwitchSchool;
  final VoidCallback onSignOut;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListView(
      padding: const EdgeInsets.fromLTRB(Siga.s3, Siga.s2, Siga.s3, 120),
      children: [
        SigaCard(
          child: Row(
            children: [
              InitialsAvatar(name, size: 56),
              const SizedBox(width: Siga.s2),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name.isEmpty ? 'Conta SIGA Plus' : name,
                      style: theme.textTheme.titleLarge,
                    ),
                    Text(
                      '$roleLabel · $schoolName',
                      style: theme.textTheme.bodyMedium,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SectionHeader('Serviços escolares'),
        MenuRow(
          icon: Icons.groups_outlined,
          title: 'Turmas',
          onTap: () => onNavigate('/more/classes'),
        ),
        MenuRow(
          icon: Icons.assignment_turned_in_outlined,
          title: 'Tarefas',
          onTap: () => onNavigate('/more/tasks'),
        ),
        MenuRow(
          icon: Icons.notifications_none,
          title: 'Avisos',
          onTap: () => onNavigate('/more/notifications'),
        ),
        if (student) ...[
          MenuRow(
            icon: Icons.account_balance_wallet_outlined,
            title: 'Propinas e recibos',
            onTap: () => onNavigate('/more/finance'),
          ),
          MenuRow(
            icon: Icons.school_outlined,
            title: 'Notas publicadas',
            onTap: () => onNavigate('/more/results'),
          ),
          MenuRow(
            icon: Icons.description_outlined,
            title: 'Documentos',
            onTap: () => onNavigate('/more/documents'),
          ),
        ],
        MenuRow(
          icon: Icons.directions_bus_outlined,
          title: 'Transporte escolar',
          onTap: () => onNavigate('/more/transport'),
        ),
        const SectionHeader('Conta'),
        MenuRow(
          icon: Icons.palette_outlined,
          title: 'Aparência',
          subtitle: 'Tema, cor principal e movimento',
          onTap: () => onNavigate('/more/appearance'),
        ),
        MenuRow(
          icon: Icons.swap_horiz,
          title: 'Mudar de escola',
          subtitle: schoolName,
          onTap: onSwitchSchool,
        ),
        const Divider(height: Siga.s3),
        MenuRow(
          icon: Icons.logout_outlined,
          title: 'Sair',
          destructive: true,
          onTap: onSignOut,
        ),
      ],
    );
  }
}
