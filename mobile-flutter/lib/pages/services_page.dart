import 'package:flutter/material.dart';
import 'package:fluentui_system_icons/fluentui_system_icons.dart';
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
    // Propinas e notas publicadas são consultas do aluno; para o professor,
    // o mosaico explica isso em vez de abrir um erro.
    final tiles = [
      (
        'Disciplinas',
        i(FluentIcons.book_open_24_regular, FluentIcons.book_open_24_filled),
        '/subjects',
      ),
      (
        'Turmas',
        i(FluentIcons.people_24_regular, FluentIcons.people_24_filled),
        '/more/classes',
      ),
      (
        'Tarefas',
        i(
          FluentIcons.clipboard_task_24_regular,
          FluentIcons.clipboard_task_24_filled,
        ),
        '/more/tasks',
      ),
      (
        'Transporte',
        i(
          FluentIcons.vehicle_bus_24_regular,
          FluentIcons.vehicle_bus_24_filled,
        ),
        '/more/transport',
      ),
      (
        'Aulas online',
        i(FluentIcons.video_24_regular, FluentIcons.video_24_filled),
        '/more/online',
      ),
      (
        'Calendário',
        i(
          FluentIcons.calendar_ltr_24_regular,
          FluentIcons.calendar_ltr_24_filled,
        ),
        '/calendar',
      ),
      (
        'WhatsApp',
        i(FluentIcons.chat_24_regular, FluentIcons.chat_24_filled),
        '/more/whatsapp',
      ),
      (
        'Google',
        i(FluentIcons.cloud_24_regular, FluentIcons.cloud_24_filled),
        '/more/google',
      ),
      (
        'Propinas',
        i(FluentIcons.wallet_24_regular, FluentIcons.wallet_24_filled),
        student ? '/more/finance' : '/more/student-only',
      ),
      (
        'Biblioteca',
        i(FluentIcons.library_24_regular, FluentIcons.library_24_filled),
        '/more/library',
      ),
      (
        'Notas',
        i(
          FluentIcons.hat_graduation_24_regular,
          FluentIcons.hat_graduation_24_filled,
        ),
        student ? '/more/results' : '/more/gradebooks',
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
            NoticeBell(
              onPressed: () => onNavigate('/more/notifications'),
              icon: AppearanceScope.icon(
                context,
                FluentIcons.alert_24_regular,
                FluentIcons.alert_24_filled,
              ),
            ),
          ],
        ),
        const SizedBox(height: Siga.s3),
        ServiceGrid(
          children: [
            for (final (i, (label, icon, path)) in tiles.indexed)
              Entrance(
                index: i ~/ 3,
                child: ServiceTile(
                  icon: icon,
                  label: label,
                  onTap: () => onNavigate(path),
                ),
              ),
            Entrance(
              index: 3,
              child: ServiceTile(
                icon: AppearanceScope.icon(
                  context,
                  FluentIcons.grid_circles_24_regular,
                  FluentIcons.grid_circles_24_filled,
                ),
                label: 'Mais',
                onTap: () => Scaffold.maybeOf(context)?.openDrawer(),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
