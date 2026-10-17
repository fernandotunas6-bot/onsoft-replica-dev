import 'package:flutter/material.dart';
import 'package:fluentui_system_icons/fluentui_system_icons.dart';
import '../academic.dart';
import '../design/portal.dart';
import '../design/tokens.dart';
import '../design/widgets.dart';
import '../gateway.dart';
import 'attendance_page.dart';
import 'task_sheet.dart';

const _weekdayNames = [
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
  'Domingo',
];

/// Uma disciplina por inteiro: professor, horário semanal, tarefas e, para
/// o aluno, a assiduidade do mês; para o professor, os alunos e a chamada.
class SubjectPage extends StatefulWidget {
  const SubjectPage({
    super.key,
    required this.gateway,
    required this.catalog,
    required this.item,
    required this.color,
    required this.icon,
  });
  final MobileGateway gateway;
  final AcademicCatalog catalog;
  final Map<String, dynamic> item;
  final Color color;
  final IconData icon;
  @override
  State<SubjectPage> createState() => _SubjectPageState();
}

class _SubjectPageState extends State<SubjectPage> {
  Future<(int, int)?>? attendance;

  bool get student => widget.gateway.role == 'aluno';
  String get id => widget.item['classSubjectId'] as String;

  List<(String, String)> get students => [
    for (final st in (widget.item['students'] as List? ?? []))
      if (st is Map && st['studentId'] is String && st['name'] is String)
        (st['studentId'] as String, st['name'] as String),
  ]..sort((a, b) => a.$2.compareTo(b.$2));

  bool get teaches =>
      !student &&
      widget.item['teacher'] is Map &&
      (widget.item['teacher'] as Map)['userId'] == widget.gateway.userId;

  @override
  void initState() {
    super.initState();
    if (student) attendance = monthAttendance();
  }

  /// Aulas registadas e faltas do aluno nesta disciplina, este mês.
  Future<(int, int)?> monthAttendance() async {
    final now = luandaClock(DateTime.now());
    String day(DateTime d) =>
        '${d.year}-${d.month.toString().padLeft(2, '0')}-'
        '${d.day.toString().padLeft(2, '0')}';
    final result = await widget.gateway.attendanceBetween(
      day(DateTime(now.year, now.month)),
      day(now),
    );
    final mine = {
      for (final st in (widget.item['students'] as List? ?? []))
        if (st is Map && st['userId'] == widget.gateway.userId) st['studentId'],
    };
    var total = 0;
    var absent = 0;
    for (final s in result['sessions'] as List) {
      if (s is! Map ||
          s['classSubjectId'] != id ||
          s['status'] == 'cancelled') {
        continue;
      }
      final records = (s['records'] as List? ?? []).whereType<Map>().toList();
      final own = records.where((r) => mine.contains(r['studentId']));
      final record = own.isNotEmpty
          ? own.first
          : (records.length == 1 ? records.single : null);
      if (record == null || record['status'] == 'not_registered') continue;
      total++;
      if (record['status'] == 'absent') absent++;
    }
    return total == 0 ? null : (total, absent);
  }

  @override
  Widget build(BuildContext context) {
    final palette = SigaPalette.of(context);
    final teacher = widget.item['teacher'];
    final slots =
        [
          for (final s in widget.catalog.slots)
            if (s['classSubjectId'] == id) s,
        ]..sort((a, b) {
          final day = (a['weekday'] as int).compareTo(b['weekday'] as int);
          return day != 0
              ? day
              : (a['startsAt'] as String).compareTo(b['startsAt'] as String);
        });
    final tasks =
        [
          for (final t in widget.catalog.tasks)
            if (t['classSubjectId'] == id) t,
        ]..sort(
          (a, b) => (a['due'] as String? ?? '9999').compareTo(
            b['due'] as String? ?? '9999',
          ),
        );
    final open = tasks.where((t) => dueText(t['due']).$2 != Urgency.overdue);
    final past = tasks.where((t) => dueText(t['due']).$2 == Urgency.overdue);
    final children = <Widget>[
      Row(
        children: [
          TintIcon(widget.icon, color: widget.color, size: 52),
          const SizedBox(width: Siga.s2),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${widget.item['className']}',
                  style: TextStyle(fontSize: 13, color: palette.ink2),
                ),
                Text(
                  '${widget.item['subjectName']}',
                  style: const TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w700,
                    letterSpacing: -.4,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
      const SizedBox(height: Siga.s2),
      Row(
        children: [
          Expanded(
            child: _Fact(
              'Professor',
              teacher is Map && teacher['name'] is String
                  ? teacher['name'] as String
                  : 'Por indicar',
            ),
          ),
          const SizedBox(width: Siga.s1),
          Expanded(
            child: _Fact(
              student ? 'Aulas por semana' : 'Alunos',
              student ? '${slots.length}' : '${students.length}',
            ),
          ),
        ],
      ),
      // A chamada é rotina do dia: só com aula desta disciplina hoje.
      if (teaches &&
          slots.any(
            (s) => s['weekday'] == luandaClock(DateTime.now()).weekday,
          )) ...[
        const SizedBox(height: Siga.s2),
        FilledButton.icon(
          onPressed: () => Navigator.of(context).push(
            MaterialPageRoute<void>(
              builder: (_) => AttendancePage(
                gateway: widget.gateway,
                classSubjectId: id,
                subjectName: '${widget.item['subjectName']}',
                className: '${widget.item['className']}',
                students: students,
              ),
            ),
          ),
          icon: const Icon(FluentIcons.clipboard_task_24_regular, size: 20),
          label: const Text('Fazer a chamada de hoje'),
        ),
      ],
      if (attendance != null)
        FutureBuilder<(int, int)?>(
          future: attendance,
          builder: (context, snapshot) {
            final value = snapshot.data;
            if (value == null) return const SizedBox.shrink();
            final (total, absent) = value;
            final rate = ((total - absent) / total * 100).round();
            return Padding(
              padding: const EdgeInsets.only(top: Siga.s2),
              child: SigaCard(
                onTap: () => Navigator.of(context).pop('/more/absences'),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Assiduidade este mês',
                            style: TextStyle(color: palette.ink2, fontSize: 13),
                          ),
                          Text(
                            '$rate%',
                            style: const TextStyle(
                              fontSize: 26,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Text(
                      absent == 0
                          ? 'Sem faltas em $total aulas'
                          : '$absent ${absent == 1 ? 'falta' : 'faltas'} em '
                                '$total aulas',
                      style: TextStyle(
                        color: absent == 0
                            ? palette.ink2
                            : const Color(0xffd92c3a),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      const SectionHeader('Horário semanal'),
      if (slots.isEmpty)
        const EmptyState(
          message: 'Sem horário publicado para esta disciplina.',
        ),
      // Uma linha por dia: horários do dia juntos e as salas, sem repetir.
      for (final day in {for (final s in slots) s['weekday'] as int})
        () {
          final today = [
            for (final s in slots)
              if (s['weekday'] == day) s,
          ];
          final rooms = {
            for (final s in today)
              if (s['room'] is String) s['room'] as String,
          };
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Row(
              children: [
                Container(
                  width: 4,
                  height: 36,
                  decoration: BoxDecoration(
                    color: widget.color,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
                const SizedBox(width: 12),
                SizedBox(
                  width: 84,
                  child: Text(
                    _weekdayNames[(day - 1).clamp(0, 6)],
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        today
                            .map(
                              (s) =>
                                  '${(s['startsAt'] as String).substring(0, 5)}–'
                                  '${(s['endsAt'] as String).substring(0, 5)}',
                            )
                            .join('  ·  '),
                      ),
                      if (rooms.isNotEmpty)
                        Text(
                          rooms.join(', '),
                          style: TextStyle(fontSize: 12, color: palette.ink2),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          );
        }(),
      SectionHeader(student ? 'Por entregar' : 'Tarefas publicadas'),
      if (open.isEmpty)
        const EmptyState(message: 'Sem tarefas com prazo em aberto.'),
      for (final t in open)
        TaskTile(
          task: t,
          subject: null,
          onTap: () => showTaskSheet(
            context,
            t,
            subject: '${widget.item['subjectName']}',
            student: student,
          ),
        ),
      if (past.isNotEmpty) ...[
        const SectionHeader('Prazo terminado'),
        for (final t in past.toList().reversed)
          TaskTile(
            task: t,
            subject: null,
            onTap: () => showTaskSheet(
              context,
              t,
              subject: '${widget.item['subjectName']}',
              student: student,
            ),
          ),
      ],
      if (!student && students.isNotEmpty) ...[
        SectionHeader('Alunos (${students.length})'),
        for (final (_, name) in students)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Row(
              children: [
                InitialsAvatar(name, size: 34),
                const SizedBox(width: 12),
                Expanded(child: Text(name)),
              ],
            ),
          ),
      ],
      PortalHint(
        student
            ? 'Entregas com ficheiros e pedidos à escola fazem-se no portal '
                  'SIGA Plus ou no desktop.'
            : 'Criar tarefas, lançar notas e editar o plano desta disciplina '
                  'faz-se no portal SIGA Plus ou no desktop.',
      ),
    ];
    return Scaffold(
      appBar: AppBar(),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(Siga.s3, 0, Siga.s3, Siga.s4),
        children: [
          for (final (i, child) in children.indexed)
            Entrance(index: i, child: child),
        ],
      ),
    );
  }
}

class _Fact extends StatelessWidget {
  const _Fact(this.label, this.value);
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) {
    final palette = SigaPalette.of(context);
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: palette.surface2,
        borderRadius: BorderRadius.circular(Siga.rMedium),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(fontSize: 12, color: palette.ink2)),
          const SizedBox(height: 4),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}
