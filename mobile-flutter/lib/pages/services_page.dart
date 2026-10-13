import 'package:flutter/material.dart';
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
    IconData i(IconData outlined, IconData modern) =>
        AppearanceScope.icon(context, outlined, modern);
    final modern = AppearanceScope.maybeOf(context)?.modernIcons ?? false;
    // Propinas e notas publicadas são consultas do aluno; para o professor,
    // o mosaico explica isso em vez de abrir um erro.
    final tiles = [
      (
        'Disciplinas',
        i(Icons.menu_book_outlined, Icons.menu_book_rounded),
        '/subjects',
      ),
      (
        'Turmas',
        i(Icons.people_outline, Icons.people_rounded),
        '/more/classes',
      ),
      (
        'Tarefas',
        i(
          Icons.assignment_turned_in_outlined,
          Icons.assignment_turned_in_rounded,
        ),
        '/more/tasks',
      ),
      (
        'Transporte',
        i(Icons.directions_bus_outlined, Icons.directions_bus_rounded),
        '/more/transport',
      ),
      (
        'Aulas online',
        i(Icons.videocam_outlined, Icons.videocam_rounded),
        '/more/online',
      ),
      (
        'Calendário',
        i(Icons.calendar_month_outlined, Icons.calendar_month_rounded),
        '/calendar',
      ),
      (
        'WhatsApp',
        i(Icons.chat_bubble_outline, Icons.chat_bubble_rounded),
        '/more/whatsapp',
      ),
      ('Google', i(Icons.cloud_outlined, Icons.cloud_rounded), '/more/google'),
      (
        'Propinas',
        i(
          Icons.account_balance_wallet_outlined,
          Icons.account_balance_wallet_rounded,
        ),
        student ? '/more/finance' : '/more/student-only',
      ),
      (
        'Biblioteca',
        i(Icons.local_library_outlined, Icons.local_library_rounded),
        '/more/library',
      ),
      (
        'Notas',
        i(Icons.school_outlined, Icons.school_rounded),
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
                  Icons.notifications_none,
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
                glyph: label == 'Biblioteca' && !modern
                    ? const LineGlyph.library()
                    : null,
                onTap: () => onNavigate(path),
              ),
            ServiceTile(
              icon: AppearanceScope.icon(
                context,
                Icons.grid_view_outlined,
                Icons.grid_view_rounded,
              ),
              label: 'Mais',
              glyph: modern ? null : const LineGlyph.rings(),
              onTap: () => Scaffold.maybeOf(context)?.openDrawer(),
            ),
          ],
        ),
      ],
    );
  }
}
