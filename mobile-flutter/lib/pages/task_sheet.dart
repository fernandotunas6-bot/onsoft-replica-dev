import 'package:flutter/material.dart';
import 'package:fluentui_system_icons/fluentui_system_icons.dart';
import '../academic.dart' show luandaClock;
import '../design/portal.dart';
import '../design/tokens.dart';
import '../design/widgets.dart';
import '../gateway.dart';
import 'package:file_picker/file_picker.dart';
import 'package:url_launcher/url_launcher.dart';

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
  MobileGateway? gateway,
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
          if (gateway != null && task['id'] is String)
            SubmissionSection(
              gateway: gateway,
              taskId: task['id'] as String,
              open: urgency != Urgency.overdue,
            ),
          PortalHint(
            student
                ? 'Entregas com outros formatos ou vários ficheiros fazem-se '
                      'no portal SIGA Plus ou no desktop.'
                : 'Editar a tarefa e avaliar entregas faz-se no portal SIGA '
                      'Plus ou no desktop.',
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

/// Tamanho legível: 850 KB, 2,4 MB.
String fileSize(num bytes) => bytes < 1024 * 1024
    ? '${(bytes / 1024).ceil()} KB'
    : '${(bytes / 1024 / 1024).toStringAsFixed(1).replaceAll('.', ',')} MB';

/// Entrega de uma tarefa. Aluno: a sua entrega e «Entregar PDF» (ou
/// «Substituir» até ao prazo). Professor: quem entregou, com o PDF.
class SubmissionSection extends StatefulWidget {
  const SubmissionSection({
    super.key,
    required this.gateway,
    required this.taskId,
    required this.open,
  });
  final MobileGateway gateway;
  final String taskId;

  /// O prazo ainda não terminou (o servidor confirma de novo ao enviar).
  final bool open;
  @override
  State<SubmissionSection> createState() => _SubmissionSectionState();
}

class _SubmissionSectionState extends State<SubmissionSection> {
  late Future<List<Map<String, dynamic>>> data = load();
  bool sending = false;

  bool get student => widget.gateway.role == 'aluno';

  Future<List<Map<String, dynamic>>> load() =>
      widget.gateway.submissions(taskId: widget.taskId);

  void notify(String text) => ScaffoldMessenger.maybeOf(
    context,
  )?.showSnackBar(SnackBar(content: Text(text)));

  Future<void> pickAndSend() async {
    final picked = await FilePicker.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['pdf'],
      withData: true,
    );
    final file = picked?.files.singleOrNull;
    final bytes = file?.bytes;
    if (file == null || bytes == null) return;
    // Mesmas regras do servidor, para responder já sem gastar dados.
    if (bytes.length > 10 * 1024 * 1024) {
      return notify('O PDF tem mais de 10 MB.');
    }
    if (bytes.length < 5 ||
        String.fromCharCodes(bytes.sublist(0, 5)) != '%PDF-') {
      return notify('O ficheiro escolhido não é um PDF.');
    }
    setState(() => sending = true);
    try {
      await widget.gateway.submitPdf(
        taskId: widget.taskId,
        fileName: file.name,
        bytes: bytes,
      );
      if (!mounted) return;
      notify('Entrega recebida pelo SIGA.');
      setState(() => data = load());
    } catch (e) {
      notify(e is CommandError ? e.message : 'Sem ligação. Tente de novo.');
    } finally {
      if (mounted) setState(() => sending = false);
    }
  }

  Future<void> openFile(Map<String, dynamic> submission) async {
    try {
      final url = await widget.gateway.submissionFile('${submission['id']}');
      if (url.host.endsWith('.invalid')) {
        return notify('Na demonstração não há ficheiro real.');
      }
      if (!await launchUrl(url, mode: LaunchMode.externalApplication)) {
        notify('Não foi possível abrir o PDF.');
      }
    } catch (e) {
      notify(e is CommandError ? e.message : 'Não foi possível abrir o PDF.');
    }
  }

  String when(dynamic iso) {
    final parsed = iso is String ? DateTime.tryParse(iso) : null;
    if (parsed == null) return '';
    final d = luandaClock(parsed);
    return '${d.day}/${d.month} às ${d.hour.toString().padLeft(2, '0')}:'
        '${d.minute.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final palette = SigaPalette.of(context);
    return FutureBuilder<List<Map<String, dynamic>>>(
      future: data,
      builder: (context, snapshot) {
        final header = Padding(
          padding: const EdgeInsets.only(top: Siga.s3, bottom: Siga.s1),
          child: Text(
            student ? 'A sua entrega' : 'Entregas',
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
          ),
        );
        if (snapshot.connectionState != ConnectionState.done &&
            !snapshot.hasData) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [header, const LinearProgressIndicator(minHeight: 2)],
          );
        }
        final error = snapshot.error;
        if (error != null) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              header,
              Text(
                error is CommandError
                    ? error.message
                    : 'Não foi possível ver as entregas.',
                style: TextStyle(color: palette.ink2),
              ),
            ],
          );
        }
        final list = snapshot.data!;
        if (!student) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              header,
              if (list.isEmpty)
                Text(
                  'Ainda ninguém entregou.',
                  style: TextStyle(color: palette.ink2),
                ),
              for (final s in list)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: InitialsAvatar(
                    '${s['studentName'] ?? 'Aluno'}',
                    size: 36,
                  ),
                  title: Text('${s['studentName'] ?? 'Aluno'}'),
                  subtitle: Text(
                    '${when(s['submittedAt'])} · ${fileSize(s['sizeBytes'] as num? ?? 0)}'
                    '${(s['version'] as num? ?? 1) > 1 ? ' · versão ${s['version']}' : ''}',
                  ),
                  trailing: const Icon(FluentIcons.document_pdf_24_regular),
                  onTap: () => openFile(s),
                ),
            ],
          );
        }
        final mine = list.isEmpty ? null : list.first;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            header,
            if (mine != null)
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: palette.surface2,
                  borderRadius: BorderRadius.circular(Siga.rMedium),
                ),
                child: Row(
                  children: [
                    const Icon(
                      FluentIcons.document_pdf_24_regular,
                      color: Color(0xffd92c3a),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${mine['fileName']}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontWeight: FontWeight.w600),
                          ),
                          Text(
                            'Entregue ${when(mine['submittedAt'])} · '
                            '${fileSize(mine['sizeBytes'] as num? ?? 0)}'
                            '${(mine['version'] as num? ?? 1) > 1 ? ' · versão ${mine['version']}' : ''}',
                            style: TextStyle(fontSize: 12, color: palette.ink2),
                          ),
                        ],
                      ),
                    ),
                    TextButton(
                      onPressed: () => openFile(mine),
                      child: const Text('Ver'),
                    ),
                  ],
                ),
              )
            else
              Text(
                widget.open
                    ? 'Ainda não entregou. Envie um PDF até 10 MB.'
                    : 'Não entregou dentro do prazo.',
                style: TextStyle(color: palette.ink2),
              ),
            if (widget.open) ...[
              const SizedBox(height: Siga.s1),
              FilledButton.icon(
                onPressed: sending ? null : pickAndSend,
                icon: sending
                    ? const SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(FluentIcons.arrow_upload_24_regular, size: 20),
                label: Text(
                  sending
                      ? 'A enviar…'
                      : mine == null
                      ? 'Entregar PDF'
                      : 'Substituir PDF',
                ),
              ),
            ],
          ],
        );
      },
    );
  }
}
