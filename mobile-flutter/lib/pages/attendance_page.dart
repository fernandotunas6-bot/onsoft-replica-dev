import 'package:flutter/material.dart';
import 'package:fluentui_system_icons/fluentui_system_icons.dart';
import '../academic.dart' show luandaClock;
import '../design/tokens.dart';
import '../design/widgets.dart';
import '../gateway.dart';

/// Estados de presença aceites pelo SIGA, pela ordem do portal.
const attendanceStatuses = [
  ('present', 'Presente', Color(0xff1f9d55)),
  ('absent', 'Falta', Color(0xffd92c3a)),
  ('late', 'Atraso', Color(0xffe8890c)),
  ('excused', 'Justificada', Color(0xff2f6bff)),
  ('early_exit', 'Saída antecipada', Color(0xff8e949e)),
];

(String, String, Color) attendanceStatus(String code) => attendanceStatuses
    .firstWhere((s) => s.$1 == code, orElse: () => attendanceStatuses.first);

/// Chamada do professor para uma disciplina, no dia de hoje (Luanda).
///
/// Grava nas mesmas tabelas do portal (sessão e registos de presença) e fecha
/// a sessão. Depois de fechada, as correcções fazem-se no portal, como no SIGA.
class AttendancePage extends StatefulWidget {
  const AttendancePage({
    super.key,
    required this.gateway,
    required this.classSubjectId,
    required this.subjectName,
    required this.className,
    required this.students,
  });
  final MobileGateway gateway;
  final String classSubjectId;
  final String subjectName;
  final String className;

  /// Alunos matriculados: (studentId, nome).
  final List<(String, String)> students;

  @override
  State<AttendancePage> createState() => _AttendancePageState();
}

class _AttendancePageState extends State<AttendancePage> {
  late final DateTime today = luandaClock(DateTime.now());
  late final String date =
      '${today.year}-${today.month.toString().padLeft(2, '0')}-'
      '${today.day.toString().padLeft(2, '0')}';
  late final Map<String, String> status = {
    for (final (id, _) in widget.students) id: 'present',
  };
  bool loading = true;
  bool saving = false;
  String? closedReason;
  String? error;

  @override
  void initState() {
    super.initState();
    load();
  }

  /// Lê o dia no SIGA: se a chamada já foi feita, mostra-a como está.
  Future<void> load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final day = await widget.gateway.attendanceOn(date);
      final sessions = [
        for (final s in day['sessions'] as List)
          if (s is Map && s['classSubjectId'] == widget.classSubjectId) s,
      ];
      String? reason;
      if (sessions.length > 1) {
        reason =
            'Há mais de uma aula hoje nesta disciplina. Faça a chamada '
            'no portal.';
      } else if (sessions.isNotEmpty) {
        final session = sessions.single;
        for (final r in (session['records'] as List? ?? [])) {
          if (r is Map &&
              r['studentId'] is String &&
              status.containsKey(r['studentId']) &&
              attendanceStatuses.any((s) => s.$1 == r['status'])) {
            status[r['studentId'] as String] = r['status'] as String;
          }
        }
        if (session['status'] == 'completed') {
          reason =
              'Chamada de hoje fechada e gravada no SIGA. Correcções '
              'fazem-se no portal.';
        } else if (session['status'] == 'cancelled') {
          reason = 'A aula de hoje foi cancelada.';
        }
      }
      if (mounted) setState(() => closedReason = reason);
    } catch (_) {
      if (mounted) {
        setState(() => error = 'Não foi possível ler as presenças de hoje.');
      }
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> save() async {
    final absent = status.values.where((s) => s != 'present').length;
    final confirmed = await showSigaSheet<bool>(
      context,
      title: 'Gravar chamada',
      builder: (sheet) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            '${widget.students.length - absent} presentes e $absent com outro '
            'estado. A chamada fica gravada no SIGA e fechada; correcções '
            'depois só no portal.',
          ),
          const SizedBox(height: Siga.s2),
          FilledButton(
            onPressed: () => Navigator.of(sheet).pop(true),
            child: const Text('Gravar e fechar'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    setState(() => saving = true);
    try {
      await widget.gateway.submitAttendance(
        classSubjectId: widget.classSubjectId,
        date: date,
        statusByStudent: status,
      );
      if (!mounted) return;
      setState(
        () => closedReason =
            'Chamada gravada no SIGA e fechada. Correcções '
            'fazem-se no portal.',
      );
      notify('Chamada gravada no SIGA.');
    } catch (e) {
      notify(e is CommandError ? e.message : 'Sem ligação. Tente de novo.');
      if (e is CommandError && e.code == 'ATTENDANCE_ALREADY_CLOSED') load();
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  void notify(String text) => ScaffoldMessenger.maybeOf(
    context,
  )?.showSnackBar(SnackBar(content: Text(text)));

  void choose(String studentId, String name) => showSigaSheet<void>(
    context,
    title: name,
    builder: (sheet) => Column(
      children: [
        for (final (code, label, color) in attendanceStatuses)
          MenuRow(
            icon: status[studentId] == code
                ? FluentIcons.checkmark_circle_24_filled
                : FluentIcons.circle_24_regular,
            title: label,
            color: color,
            onTap: () {
              Navigator.of(sheet).pop();
              setState(() => status[studentId] = code);
            },
          ),
      ],
    ),
  );

  @override
  Widget build(BuildContext context) {
    final palette = SigaPalette.of(context);
    final editable = !loading && error == null && closedReason == null;
    final present = status.values.where((s) => s == 'present').length;
    const months = [
      'Janeiro',
      'Fevereiro',
      'Março',
      'Abril',
      'Maio',
      'Junho',
      'Julho',
      'Agosto',
      'Setembro',
      'Outubro',
      'Novembro',
      'Dezembro',
    ];
    return Scaffold(
      appBar: AppBar(title: const Text('Chamada')),
      bottomNavigationBar: editable && widget.students.isNotEmpty
          ? SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(
                  Siga.s3,
                  Siga.s1,
                  Siga.s3,
                  Siga.s2,
                ),
                child: FilledButton(
                  onPressed: saving ? null : save,
                  child: Text(saving ? 'A gravar…' : 'Gravar chamada'),
                ),
              ),
            )
          : null,
      body: ListView(
        padding: const EdgeInsets.fromLTRB(Siga.s3, 0, Siga.s3, Siga.s3),
        children: [
          Text(
            '${widget.className} · Hoje, ${today.day} de ${months[today.month - 1]}',
            style: TextStyle(fontSize: 13, color: palette.ink2),
          ),
          const SizedBox(height: 6),
          Text(
            widget.subjectName,
            style: const TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.w700,
              letterSpacing: -.5,
            ),
          ),
          const SizedBox(height: Siga.s2),
          if (loading)
            const Padding(
              padding: EdgeInsets.all(Siga.s3),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (error != null)
            EmptyState(
              icon: FluentIcons.cloud_off_24_regular,
              message: error!,
              action: 'Tentar novamente',
              onAction: load,
            )
          else ...[
            if (closedReason != null)
              Padding(
                padding: const EdgeInsets.only(bottom: Siga.s2),
                child: SigaCard(
                  child: Row(
                    children: [
                      const IconBadge(
                        FluentIcons.lock_closed_24_regular,
                        size: 40,
                      ),
                      const SizedBox(width: Siga.s2),
                      Expanded(child: Text(closedReason!)),
                    ],
                  ),
                ),
              ),
            if (widget.students.isEmpty)
              const EmptyState(
                message: 'Sem alunos matriculados nesta disciplina.',
              )
            else ...[
              Row(
                children: [
                  Expanded(
                    child: Text(
                      '$present de ${widget.students.length} presentes',
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                  ),
                  if (editable)
                    TextButton(
                      onPressed: () =>
                          setState(() => status.updateAll((_, _) => 'present')),
                      child: const Text('Todos presentes'),
                    ),
                ],
              ),
              const SizedBox(height: Siga.s1),
              for (final (id, name) in widget.students)
                _StudentRow(
                  name: name,
                  status: status[id]!,
                  onTap: editable
                      ? () => setState(
                          () => status[id] = status[id] == 'present'
                              ? 'absent'
                              : 'present',
                        )
                      : null,
                  onMore: editable ? () => choose(id, name) : null,
                ),
              if (editable) ...[
                const SizedBox(height: Siga.s2),
                Text(
                  'Toque num aluno para alternar entre presente e falta; '
                  'use ⋯ para atraso, justificada ou saída antecipada.',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ],
          ],
        ],
      ),
    );
  }
}

class _StudentRow extends StatelessWidget {
  const _StudentRow({
    required this.name,
    required this.status,
    this.onTap,
    this.onMore,
  });
  final String name;
  final String status;
  final VoidCallback? onTap;
  final VoidCallback? onMore;
  @override
  Widget build(BuildContext context) {
    final (_, label, color) = attendanceStatus(status);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(Siga.rMedium),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(
          children: [
            InitialsAvatar(name, size: 40),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                name,
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
            AnimatedContainer(
              duration: Siga.motion(context, Siga.quick),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: color.withValues(alpha: .12),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                label,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: color,
                ),
              ),
            ),
            if (onMore != null)
              IconButton(
                tooltip: 'Outros estados',
                onPressed: onMore,
                icon: const Icon(FluentIcons.more_horizontal_24_regular),
              ),
          ],
        ),
      ),
    );
  }
}
