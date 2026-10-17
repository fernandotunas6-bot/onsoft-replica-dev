import 'package:flutter/material.dart';
import 'package:fluentui_system_icons/fluentui_system_icons.dart';
import '../academic.dart';
import '../design/tokens.dart';
import '../design/widgets.dart';
import '../gateway.dart';
import 'attendance_page.dart';

const _months = [
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

/// Rótulo e cor de um estado de presença, incluindo «sem registo».
(String, Color) presenceLabel(String code) => code == 'not_registered'
    ? ('Sem registo', const Color(0xff8e949e))
    : (attendanceStatus(code).$2, attendanceStatus(code).$3);

String _date(DateTime d) =>
    '${d.year}-${d.month.toString().padLeft(2, '0')}-'
    '${d.day.toString().padLeft(2, '0')}';

/// Faltas e presenças registadas no SIGA, mês a mês.
///
/// Aluno: assiduidade do mês, faltas por disciplina e cada ocorrência.
/// Professor: chamadas fechadas e por fazer nas suas disciplinas; uma chamada
/// por fazer num dia passado abre-se aqui mesmo.
class AbsencesPage extends StatefulWidget {
  const AbsencesPage({super.key, required this.gateway});
  final MobileGateway gateway;
  @override
  State<AbsencesPage> createState() => _AbsencesPageState();
}

class _AbsencesPageState extends State<AbsencesPage> {
  late DateTime month = () {
    final now = luandaClock(DateTime.now());
    return DateTime(now.year, now.month);
  }();
  late Future<(AcademicCatalog, Map<String, dynamic>)> data;

  bool get professor => widget.gateway.role == 'professor';

  @override
  void initState() {
    super.initState();
    load();
  }

  void load() {
    final last = DateTime(month.year, month.month + 1, 0);
    data = () async {
      final results = await Future.wait([
        widget.gateway.read('academic'),
        widget.gateway.attendanceBetween(_date(month), _date(last)),
      ]);
      return (AcademicCatalog.parse(results[0]), results[1]);
    }();
  }

  void shift(int delta) {
    final now = luandaClock(DateTime.now());
    final next = DateTime(month.year, month.month + delta);
    if (next.isAfter(DateTime(now.year, now.month))) return;
    setState(() {
      month = next;
      load();
    });
  }

  /// Sessões válidas do mês, da mais recente para a mais antiga.
  List<Map<String, dynamic>> sessions(Map<String, dynamic> day) => [
    for (final s in (day['sessions'] as List))
      if (s is Map<String, dynamic> &&
          s['classSubjectId'] is String &&
          s['date'] is String)
        s,
  ]..sort((a, b) => (b['date'] as String).compareTo(a['date'] as String));

  String subjectName(AcademicCatalog catalog, dynamic id) {
    final match = catalog.classes.where((c) => c['classSubjectId'] == id);
    return match.isEmpty ? 'Disciplina' : match.first['subjectName'] as String;
  }

  String dayLabel(String iso) {
    final d = DateTime.parse(iso);
    const weekdays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
    return '${weekdays[d.weekday - 1]}, ${d.day} de ${_months[d.month - 1]}';
  }

  // ───────── Aluno ─────────

  List<Widget> student(AcademicCatalog catalog, Map<String, dynamic> day) {
    final palette = SigaPalette.of(context);
    // Os registos do próprio aluno: pelo vínculo do catálogo, ou, quando o
    // servidor já devolve só os do aluno, o único registo de cada sessão.
    final mine = {
      for (final c in catalog.classes)
        for (final st in (c['students'] as List? ?? []))
          if (st is Map && st['userId'] == widget.gateway.userId)
            st['studentId'],
    };
    final entries = <(String date, String subject, String status)>[];
    for (final s in sessions(day)) {
      if (s['status'] == 'cancelled') continue;
      final records = (s['records'] as List? ?? []).whereType<Map>().toList();
      final own = records.where((r) => mine.contains(r['studentId'])).toList();
      final record = own.isNotEmpty
          ? own.first
          : (records.length == 1 ? records.single : null);
      if (record == null || record['status'] is! String) continue;
      entries.add((
        s['date'] as String,
        s['classSubjectId'] as String,
        record['status'] as String,
      ));
    }
    final counted = entries.where((e) => e.$3 != 'not_registered').toList();
    int count(String code) => counted.where((e) => e.$3 == code).length;
    final attended = counted
        .where((e) => {'present', 'late', 'early_exit'}.contains(e.$3))
        .length;
    final rate = counted.isEmpty ? null : attended / counted.length;
    final bySubject = <String, (int, int)>{};
    for (final e in counted) {
      final (absent, total) = bySubject[e.$2] ?? (0, 0);
      bySubject[e.$2] = (absent + (e.$3 == 'absent' ? 1 : 0), total + 1);
    }
    final occurrences = entries.where((e) => e.$3 != 'present').toList();
    return [
      SigaCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Assiduidade', style: TextStyle(color: palette.ink2)),
            const SizedBox(height: 4),
            Text(
              rate == null ? '—' : '${(rate * 100).round()}%',
              style: const TextStyle(
                fontSize: 34,
                fontWeight: FontWeight.w700,
                letterSpacing: -1,
              ),
            ),
            if (rate != null) ...[
              const SizedBox(height: Siga.s1),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: rate,
                  minHeight: 6,
                  backgroundColor: palette.surface2,
                ),
              ),
            ],
            const SizedBox(height: Siga.s2),
            Wrap(
              spacing: Siga.s2,
              runSpacing: Siga.s1,
              children: [
                for (final code in [
                  'present',
                  'absent',
                  'late',
                  'excused',
                  'early_exit',
                ])
                  _Count(label: presenceLabel(code), value: count(code)),
              ],
            ),
          ],
        ),
      ),
      if (bySubject.isNotEmpty) ...[
        const SectionHeader('Por disciplina'),
        for (final MapEntry(key: id, value: (absent, total))
            in bySubject.entries)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    subjectName(catalog, id),
                    style: const TextStyle(fontWeight: FontWeight.w500),
                  ),
                ),
                Text(
                  absent == 0
                      ? 'Sem faltas · $total aulas'
                      : '$absent ${absent == 1 ? 'falta' : 'faltas'} · '
                            '$total aulas',
                  style: TextStyle(
                    color: absent == 0 ? palette.ink2 : const Color(0xffd92c3a),
                    fontSize: 13,
                  ),
                ),
              ],
            ),
          ),
      ],
      const SectionHeader('Ocorrências'),
      if (occurrences.isEmpty)
        EmptyState(
          icon: FluentIcons.checkmark_circle_24_regular,
          message: entries.isEmpty
              ? 'Sem presenças registadas neste mês.'
              : 'Esteve presente em todas as aulas registadas.',
        ),
      for (final (date, subject, code) in occurrences)
        _Row(
          title: subjectName(catalog, subject),
          subtitle: dayLabel(date),
          status: presenceLabel(code),
        ),
    ];
  }

  // ───────── Professor ─────────

  List<Widget> teacher(AcademicCatalog catalog, Map<String, dynamic> day) {
    final palette = SigaPalette.of(context);
    final mine = {
      for (final c in catalog.classes)
        if (c['teacher'] is Map &&
            (c['teacher'] as Map)['userId'] == widget.gateway.userId)
          c['classSubjectId'] as String: c,
    };
    // As chamadas por fechar primeiro: são as que pedem acção.
    final list =
        [
          for (final s in sessions(day))
            if (mine.isEmpty || mine.containsKey(s['classSubjectId'])) s,
        ]..sort(
          (a, b) => (a['status'] == 'pending' ? 0 : 1).compareTo(
            b['status'] == 'pending' ? 0 : 1,
          ),
        );
    final closed = list.where((s) => s['status'] == 'completed').length;
    final pending = list.where((s) => s['status'] == 'pending').length;
    final lessons = [
      for (final l in (day['teacherLessons'] as List? ?? []))
        if (l is Map) l,
    ];
    final confirmed = lessons.where((l) => l['status'] == 'confirmed').length;
    final today = _date(luandaClock(DateTime.now()));
    return [
      Row(
        children: [
          Expanded(child: _Stat('Chamadas fechadas', '$closed')),
          const SizedBox(width: Siga.s1),
          Expanded(child: _Stat('Por fechar', '$pending', alert: pending > 0)),
          const SizedBox(width: Siga.s1),
          Expanded(child: _Stat('Aulas confirmadas', '$confirmed')),
        ],
      ),
      const SectionHeader('Chamadas do mês'),
      if (list.isEmpty)
        const EmptyState(message: 'Sem chamadas registadas neste mês.'),
      for (final s in list)
        () {
          final records = (s['records'] as List? ?? []).whereType<Map>();
          final present = records
              .where(
                (r) => {'present', 'late', 'early_exit'}.contains(r['status']),
              )
              .length;
          final status = switch (s['status']) {
            'completed' => ('Fechada', const Color(0xff1f9d55)),
            'cancelled' => ('Cancelada', const Color(0xff8e949e)),
            _ => ('Por fechar', const Color(0xffe8890c)),
          };
          final subject = mine[s['classSubjectId']];
          final canOpen =
              s['status'] == 'pending' &&
              subject != null &&
              (s['date'] as String).compareTo(today) <= 0;
          return _Row(
            title: subjectName(catalog, s['classSubjectId']),
            subtitle:
                '${dayLabel(s['date'] as String)}'
                '${records.isEmpty ? '' : ' · $present de ${records.length} presentes'}',
            status: status,
            onTap: canOpen
                ? () async {
                    await Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => AttendancePage(
                          gateway: widget.gateway,
                          classSubjectId: subject['classSubjectId'] as String,
                          subjectName: subject['subjectName'] as String,
                          className: subject['className'] as String,
                          day: DateTime.parse(s['date'] as String),
                          students: [
                            for (final st
                                in (subject['students'] as List? ?? []))
                              if (st is Map &&
                                  st['studentId'] is String &&
                                  st['name'] is String)
                                (
                                  st['studentId'] as String,
                                  st['name'] as String,
                                ),
                          ],
                        ),
                      ),
                    );
                    if (mounted) setState(load);
                  }
                : null,
          );
        }(),
      const SizedBox(height: Siga.s2),
      Text(
        'Chamadas por fechar de dias passados abrem-se aqui. Correcções a '
        'chamadas fechadas fazem-se no portal.',
        style: TextStyle(fontSize: 12, color: palette.ink2),
      ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final now = luandaClock(DateTime.now());
    final current = month.year == now.year && month.month == now.month;
    return RefreshIndicator(
      onRefresh: () async {
        setState(load);
        try {
          await data;
        } catch (_) {
          /* erro visível */
        }
      },
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(Siga.s3, 0, Siga.s3, Siga.s4),
        children: [
          Row(
            children: [
              IconButton(
                tooltip: 'Mês anterior',
                onPressed: () => shift(-1),
                icon: const Icon(FluentIcons.chevron_left_24_regular),
              ),
              Expanded(
                child: Text(
                  '${_months[month.month - 1]} ${month.year}',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              IconButton(
                tooltip: 'Mês seguinte',
                onPressed: current ? null : () => shift(1),
                icon: const Icon(FluentIcons.chevron_right_24_regular),
              ),
            ],
          ),
          const SizedBox(height: Siga.s1),
          FutureBuilder(
            future: data,
            builder: (context, snapshot) {
              if (snapshot.connectionState != ConnectionState.done) {
                return const Padding(
                  padding: EdgeInsets.all(Siga.s4),
                  child: Center(child: CircularProgressIndicator()),
                );
              }
              if (snapshot.hasError) {
                return EmptyState(
                  icon: FluentIcons.cloud_off_24_regular,
                  message: 'Não foi possível carregar as presenças.',
                  action: 'Tentar novamente',
                  onAction: () => setState(load),
                );
              }
              final (catalog, day) = snapshot.data!;
              final children = professor
                  ? teacher(catalog, day)
                  : student(catalog, day);
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (final (i, child) in children.indexed)
                    Entrance(index: i, child: child),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

class _Count extends StatelessWidget {
  const _Count({required this.label, required this.value});
  final (String, Color) label;
  final int value;
  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Container(
        width: 8,
        height: 8,
        decoration: BoxDecoration(color: label.$2, shape: BoxShape.circle),
      ),
      const SizedBox(width: 6),
      Text(
        '${label.$1} $value',
        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
      ),
    ],
  );
}

class _Stat extends StatelessWidget {
  const _Stat(this.label, this.value, {this.alert = false});
  final String label;
  final String value;
  final bool alert;
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
          Text(
            value,
            style: TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w700,
              color: alert ? const Color(0xffe8890c) : null,
            ),
          ),
          const SizedBox(height: 2),
          Text(label, style: TextStyle(fontSize: 12, color: palette.ink2)),
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({
    required this.title,
    required this.subtitle,
    required this.status,
    this.onTap,
  });
  final String title;
  final String subtitle;
  final (String, Color) status;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) => InkWell(
    onTap: onTap,
    borderRadius: BorderRadius.circular(Siga.rMedium),
    child: Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 2),
                Text(subtitle, style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: status.$2.withValues(alpha: .12),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(
              status.$1,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: status.$2,
              ),
            ),
          ),
          if (onTap != null) ...[
            const SizedBox(width: 4),
            const Icon(FluentIcons.chevron_right_24_regular, size: 20),
          ],
        ],
      ),
    ),
  );
}
