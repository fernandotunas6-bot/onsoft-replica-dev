import 'package:flutter/material.dart';
import 'package:fluentui_system_icons/fluentui_system_icons.dart';
import '../academic.dart' show luandaClock;
import '../design/portal.dart';
import '../design/tokens.dart';
import '../design/widgets.dart';

const _weekdays = [
  'segunda',
  'terça',
  'quarta',
  'quinta',
  'sexta',
  'sábado',
  'domingo',
];

/// Urgência de um prazo, para agrupar e dar cor.
enum Urgency { overdue, today, week, later, none }

/// Prazo relativo ao relógio de Luanda: «Termina hoje às 18:00»,
/// «Termina amanhã», «Termina na quinta», «Terminou há 3 dias»…
(String, Urgency) dueText(dynamic due, {DateTime? now}) {
  if (due is! String) return ('Sem prazo indicado', Urgency.none);
  final parsed = DateTime.tryParse(due);
  if (parsed == null) return ('Sem prazo indicado', Urgency.none);
  final local = luandaClock(parsed);
  final today = luandaClock(now ?? DateTime.now());
  final days = DateTime(
    local.year,
    local.month,
    local.day,
  ).difference(DateTime(today.year, today.month, today.day)).inDays;
  final hour =
      '${local.hour.toString().padLeft(2, '0')}:'
      '${local.minute.toString().padLeft(2, '0')}';
  if (parsed.isBefore(now ?? DateTime.now())) {
    return switch (days) {
      0 => ('Terminou hoje às $hour', Urgency.overdue),
      -1 => ('Terminou ontem', Urgency.overdue),
      _ => ('Terminou há ${-days} dias', Urgency.overdue),
    };
  }
  return switch (days) {
    0 => ('Termina hoje às $hour', Urgency.today),
    1 => ('Termina amanhã às $hour', Urgency.week),
    < 7 => ('Termina na ${_weekdays[local.weekday - 1]}', Urgency.week),
    _ => ('Termina a ${local.day}/${local.month} às $hour', Urgency.later),
  };
}

Color urgencyColor(Urgency urgency, BuildContext context) => switch (urgency) {
  Urgency.overdue => SigaPalette.of(context).ink2,
  Urgency.today => const Color(0xffd92c3a),
  Urgency.week => const Color(0xffe8890c),
  _ => SigaPalette.of(context).ink2,
};

/// Folha de uma tarefa: disciplina, prazo relativo, instruções e, para o
/// aluno, onde entregar.
void showTaskSheet(
  BuildContext context,
  Map<String, dynamic> task, {
  required String subject,
  required bool student,
}) {
  final (due, urgency) = dueText(task['due']);
  showSigaSheet<void>(
    context,
    title: '${task['title']}',
    builder: (sheet) {
      final palette = SigaPalette.of(sheet);
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(subject, style: TextStyle(color: palette.ink2)),
          const SizedBox(height: Siga.s1),
          Row(
            children: [
              Icon(
                FluentIcons.clock_24_regular,
                size: 18,
                color: urgencyColor(urgency, sheet),
              ),
              const SizedBox(width: 6),
              Text(
                due,
                style: TextStyle(
                  fontWeight: FontWeight.w600,
                  color: urgencyColor(urgency, sheet),
                ),
              ),
            ],
          ),
          const SizedBox(height: Siga.s2),
          Text(
            task['instructions'] is String &&
                    (task['instructions'] as String).trim().isNotEmpty
                ? task['instructions'] as String
                : 'Sem instruções adicionais.',
            style: const TextStyle(height: 1.5),
          ),
          PortalHint(
            student
                ? 'A entrega com ficheiros faz-se no portal SIGA Plus ou no '
                      'desktop.'
                : 'Editar a tarefa e ver entregas faz-se no portal SIGA Plus '
                      'ou no desktop.',
          ),
        ],
      );
    },
  );
}

/// Linha de tarefa com o prazo relativo a cores.
class TaskTile extends StatelessWidget {
  const TaskTile({
    super.key,
    required this.task,
    required this.subject,
    required this.onTap,
    this.icon = FluentIcons.task_list_ltr_24_regular,
  });
  final Map<String, dynamic> task;
  final String? subject;
  final VoidCallback onTap;
  final IconData icon;
  @override
  Widget build(BuildContext context) {
    final (due, urgency) = dueText(task['due']);
    final color = urgencyColor(urgency, context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(Siga.rMedium),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
        child: Row(
          children: [
            Icon(icon, size: 22),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${task['title']}',
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text.rich(
                    TextSpan(
                      children: [
                        if (subject != null) TextSpan(text: '$subject · '),
                        TextSpan(
                          text: due,
                          style: TextStyle(
                            color: color,
                            fontWeight:
                                urgency == Urgency.today ||
                                    urgency == Urgency.week
                                ? FontWeight.w600
                                : null,
                          ),
                        ),
                      ],
                    ),
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
            const Icon(FluentIcons.chevron_right_24_regular, size: 20),
          ],
        ),
      ),
    );
  }
}
