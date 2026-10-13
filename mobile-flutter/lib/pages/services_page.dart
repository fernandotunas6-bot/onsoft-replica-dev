import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../design/tokens.dart';
import '../design/widgets.dart';

/// «Serviços escolares» (referência «Nova organização da aplicação»): cada
/// mosaico abre uma página própria; nenhum é atalho sem destino.
class ServicesPage extends StatelessWidget {
  const ServicesPage({
    super.key,
    required this.schoolName,
    required this.student,
    required this.onNavigate,
    required this.onSwitchSchool,
  });
  final String schoolName;
  final bool student;
  final ValueChanged<String> onNavigate;
  final VoidCallback onSwitchSchool;

  @override
  Widget build(BuildContext context) {
    final palette = SigaPalette.of(context);
    IconData i(IconData line, IconData classic) =>
        AppearanceScope.icon(context, line, classic);
    final modern = AppearanceScope.maybeOf(context)?.modernIcons ?? true;
    // Propinas e notas publicadas são consultas do aluno; para o professor,
    // o mosaico explica isso em vez de abrir um erro.
    final tiles = [
      (
        'Disciplinas',
        i(LucideIcons.bookOpen, Icons.menu_book_rounded),
        '/subjects',
      ),
      ('Turmas', i(LucideIcons.users, Icons.people_rounded), '/more/classes'),
      (
        'Tarefas',
        i(LucideIcons.clipboardCheck, Icons.assignment_turned_in_rounded),
        '/more/tasks',
      ),
      (
        'Transporte',
        i(LucideIcons.bus, Icons.directions_bus_rounded),
        '/more/transport',
      ),
      (
        'Aulas online',
        i(LucideIcons.video, Icons.videocam_rounded),
        '/more/online',
      ),
      (
        'Calendário',
        i(LucideIcons.calendarDays, Icons.calendar_month_rounded),
        '/calendar',
      ),
      (
        'WhatsApp',
        i(LucideIcons.messageCircle, Icons.chat_bubble_rounded),
        '/more/whatsapp',
      ),
      ('Google', i(LucideIcons.cloud, Icons.cloud_rounded), '/more/google'),
      (
        'Propinas',
        i(LucideIcons.wallet, Icons.account_balance_wallet_rounded),
        student ? '/more/finance' : '/more/student-only',
      ),
      (
        'Biblioteca',
        i(LucideIcons.library, Icons.local_library_rounded),
        '/more/library',
      ),
      (
        'Notas',
        i(LucideIcons.graduationCap, Icons.school_rounded),
        student ? '/more/results' : '/more/student-only',
      ),
    ];
    return ListView(
      padding: const EdgeInsets.fromLTRB(Siga.s3, Siga.s2, Siga.s3, 96),
      children: [
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Semantics(
                    button: true,
                    label: 'Escola activa: $schoolName. Mudar de escola',
                    excludeSemantics: true,
                    child: InkWell(
                      onTap: onSwitchSchool,
                      child: Text(
                        'SIGA Plus · $schoolName',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 14, color: palette.ink2),
                      ),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Semantics(
                    header: true,
                    child: const Text(
                      'Serviços escolares',
                      style: TextStyle(
                        fontSize: 26,
                        fontWeight: FontWeight.w700,
                        letterSpacing: -.5,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            IconButton(
              tooltip: 'Avisos',
              onPressed: () => onNavigate('/more/notifications'),
              icon: Icon(
                AppearanceScope.icon(
                  context,
                  LucideIcons.bell,
                  Icons.notifications_rounded,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: Siga.s3),
        ServiceGrid(
          children: [
            for (final (label, icon, path) in tiles)
              ServiceTile(
                icon: icon,
                label: label,
                onTap: () => onNavigate(path),
              ),
            ServiceTile(
              icon: AppearanceScope.icon(
                context,
                LucideIcons.layoutGrid,
                Icons.grid_view_rounded,
              ),
              label: 'Mais',
              glyph: modern ? const LineGlyph.rings() : null,
              onTap: () => Scaffold.maybeOf(context)?.openDrawer(),
            ),
          ],
        ),
      ],
    );
  }
}
