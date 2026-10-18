import 'package:flutter/material.dart';
import 'package:fluentui_system_icons/fluentui_system_icons.dart';
import '../design/portal.dart';
import '../design/tokens.dart';
import '../design/widgets.dart';
import 'pending_page.dart' show pendingServices;

/// Um destino dos Serviços: rótulo, ícone (traço, cheio) e rota.
typedef _Service = (String, (IconData, IconData), String);

/// «Serviços escolares», organizados pelo que se faz em cada sítio:
///
/// 1. **Do dia a dia** — a rotina do perfil, em mosaicos (como na
///    referência «Nova organização da aplicação»).
/// 2. **Consultas** — ver o que a escola publicou.
/// 3. **No portal SIGA Plus** — trabalho complexo, que a app não faz: cada
///    linha explica porquê e abre o portal web.
/// 4. **Por activar** — integrações que ainda não existem no SIGA.
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

  static const _studentRoutine = <_Service>[
    (
      'Disciplinas',
      (FluentIcons.book_open_24_regular, FluentIcons.book_open_24_filled),
      '/subjects',
    ),
    (
      'Tarefas',
      (
        FluentIcons.clipboard_task_24_regular,
        FluentIcons.clipboard_task_24_filled,
      ),
      '/more/tasks',
    ),
    (
      'Calendário',
      (FluentIcons.calendar_ltr_24_regular, FluentIcons.calendar_ltr_24_filled),
      '/calendar',
    ),
    (
      'Faltas',
      (
        FluentIcons.calendar_cancel_24_regular,
        FluentIcons.calendar_cancel_24_filled,
      ),
      '/more/absences',
    ),
    (
      'Notas',
      (
        FluentIcons.hat_graduation_24_regular,
        FluentIcons.hat_graduation_24_filled,
      ),
      '/more/results',
    ),
    (
      'Transporte',
      (FluentIcons.vehicle_bus_24_regular, FluentIcons.vehicle_bus_24_filled),
      '/more/transport',
    ),
  ];

  static const _teacherRoutine = <_Service>[
    (
      'Turmas',
      (FluentIcons.people_24_regular, FluentIcons.people_24_filled),
      '/more/classes',
    ),
    (
      'Chamadas',
      (
        FluentIcons.clipboard_task_24_regular,
        FluentIcons.clipboard_task_24_filled,
      ),
      '/more/absences',
    ),
    (
      'Calendário',
      (FluentIcons.calendar_ltr_24_regular, FluentIcons.calendar_ltr_24_filled),
      '/calendar',
    ),
    (
      'Disciplinas',
      (FluentIcons.book_open_24_regular, FluentIcons.book_open_24_filled),
      '/subjects',
    ),
    (
      'Pautas',
      (FluentIcons.table_24_regular, FluentIcons.table_24_filled),
      '/more/gradebooks',
    ),
    (
      'Planos',
      (FluentIcons.notebook_24_regular, FluentIcons.notebook_24_filled),
      '/more/lesson-plans',
    ),
  ];

  static const _studentQueries = <_Service>[
    (
      'Propinas e recibos',
      (FluentIcons.wallet_24_regular, FluentIcons.wallet_24_filled),
      '/more/finance',
    ),
    (
      'Documentos',
      (
        FluentIcons.document_text_24_regular,
        FluentIcons.document_text_24_filled,
      ),
      '/more/documents',
    ),
    (
      'Avisos da escola',
      (FluentIcons.alert_24_regular, FluentIcons.alert_24_filled),
      '/more/notifications',
    ),
  ];

  static const _teacherQueries = <_Service>[
    (
      'Tarefas publicadas',
      (
        FluentIcons.task_list_ltr_24_regular,
        FluentIcons.task_list_ltr_24_filled,
      ),
      '/more/tasks',
    ),
    (
      'Avisos da escola',
      (FluentIcons.alert_24_regular, FluentIcons.alert_24_filled),
      '/more/notifications',
    ),
  ];

  /// Integrações sem dados no SIGA: ficam à parte, sem se misturar com a
  /// rotina.
  static const _pending = ['online', 'whatsapp', 'google', 'library'];

  @override
  Widget build(BuildContext context) {
    final palette = SigaPalette.of(context);
    IconData icon((IconData, IconData) pair) =>
        AppearanceScope.icon(context, pair.$1, pair.$2);
    final routine = student ? _studentRoutine : _teacherRoutine;
    final queries = student ? _studentQueries : _teacherQueries;
    final children = <Widget>[
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
            icon: icon((
              FluentIcons.alert_24_regular,
              FluentIcons.alert_24_filled,
            )),
          ),
        ],
      ),
      const _Section('Do dia a dia'),
      ServiceGrid(
        children: [
          for (final (label, pair, path) in routine)
            ServiceTile(
              icon: icon(pair),
              label: label,
              onTap: () => onNavigate(path),
            ),
        ],
      ),
      const _Section('Consultas'),
      for (final (label, pair, path) in queries)
        MenuRow(icon: icon(pair), title: label, onTap: () => onNavigate(path)),
      const _Section(
        'No portal SIGA Plus',
        note:
            'Trabalho complexo faz-se no portal web ou no aplicativo desktop.',
      ),
      for (final task in portalTasks(student: student))
        MenuRow(
          icon: task.icon,
          title: task.title,
          trailing: Icon(
            FluentIcons.open_24_regular,
            size: 18,
            color: palette.ink2,
          ),
          onTap: () => showPortalTask(context, task),
        ),
      const _Section('Por activar'),
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          for (final key in _pending)
            if (pendingServices[key] case final service?)
              ActionChip(
                avatar: Icon(service.icon, size: 18, color: palette.ink2),
                label: Text(service.title),
                labelStyle: TextStyle(color: palette.ink2, fontSize: 13),
                backgroundColor: palette.surface2,
                side: BorderSide.none,
                shape: const StadiumBorder(),
                onPressed: () => onNavigate('/more/$key'),
              ),
        ],
      ),
    ];
    return ListView(
      padding: const EdgeInsets.fromLTRB(Siga.s3, Siga.s2, Siga.s3, 96),
      children: [
        for (final (i, child) in children.indexed)
          Entrance(index: i, child: child),
      ],
    );
  }
}

/// Título de secção com nota opcional por baixo.
class _Section extends StatelessWidget {
  const _Section(this.title, {this.note});
  final String title;
  final String? note;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: Siga.s3, bottom: Siga.s1),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Semantics(
          header: true,
          child: Text(
            title,
            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
          ),
        ),
        if (note != null)
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(
              note!,
              style: TextStyle(
                fontSize: 12.5,
                color: SigaPalette.of(context).ink2,
              ),
            ),
          ),
      ],
    ),
  );
}
