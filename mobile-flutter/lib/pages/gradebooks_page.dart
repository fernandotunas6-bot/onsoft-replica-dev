import 'package:flutter/material.dart';
import 'package:fluentui_system_icons/fluentui_system_icons.dart';
import '../academic.dart';
import '../design/portal.dart';
import '../design/tokens.dart';
import '../design/widgets.dart';
import '../gateway.dart';

/// Estado de uma pauta, como no portal.
(String, Color) gradebookStatus(dynamic code) => switch (code) {
  'draft' => ('Rascunho', const Color(0xff8e949e)),
  'open' => ('Aberta', const Color(0xff2f6bff)),
  'submitted' => ('Submetida', const Color(0xffe8890c)),
  'closed' => ('Fechada', const Color(0xff1f9d55)),
  _ => ('—', const Color(0xff8e949e)),
};

/// Nota com uma casa decimal e vírgula (14,5); inteiros sem casas.
String scoreText(num value) => value == value.roundToDouble()
    ? '${value.round()}'
    : value.toStringAsFixed(1).replaceAll('.', ',');

/// Notas do professor: as pautas das suas disciplinas, por trimestre, com
/// os elementos de avaliação e o que já está lançado. Só consulta: lançar e
/// alterar notas faz-se no portal.
class GradebooksPage extends StatefulWidget {
  const GradebooksPage({super.key, required this.gateway});
  final MobileGateway gateway;
  @override
  State<GradebooksPage> createState() => _GradebooksPageState();
}

class _GradebooksPageState extends State<GradebooksPage> {
  late Future<(AcademicCatalog, List<Map<String, dynamic>>)> data;

  @override
  void initState() {
    super.initState();
    load();
  }

  void load() {
    data = () async {
      final results = await Future.wait([
        widget.gateway.read('academic'),
        widget.gateway.read('gradebooks'),
      ]);
      final books = results[1]['books'];
      if (books is! List || books.any((b) => b is! Map<String, dynamic>)) {
        throw const FormatException('Pautas inválidas.');
      }
      return (
        AcademicCatalog.parse(results[0]),
        books.cast<Map<String, dynamic>>(),
      );
    }();
  }

  @override
  Widget build(BuildContext context) => FutureBuilder(
    future: data,
    builder: (context, snapshot) {
      if (snapshot.connectionState != ConnectionState.done) {
        return const Center(child: CircularProgressIndicator());
      }
      if (snapshot.hasError) {
        return Center(
          child: EmptyState(
            icon: FluentIcons.cloud_off_24_regular,
            message: 'Não foi possível carregar as pautas.',
            action: 'Tentar novamente',
            onAction: () => setState(load),
          ),
        );
      }
      final (catalog, books) = snapshot.data!;
      final bySubject = <String, List<Map<String, dynamic>>>{};
      for (final b in books) {
        (bySubject[b['classSubjectId'] as String? ?? ''] ??= []).add(b);
      }
      final children = <Widget>[
        if (books.isEmpty)
          const EmptyState(message: 'Sem pautas nas suas disciplinas.'),
        for (final MapEntry(key: id, value: list) in bySubject.entries) ...[
          SectionHeader(_subjectLine(catalog, id)),
          for (final book
              in list..sort(
                (a, b) => ((a['term'] as Map?)?['sequence'] as num? ?? 0)
                    .compareTo((b['term'] as Map?)?['sequence'] as num? ?? 0),
              ))
            _BookCard(
              book: book,
              students: _students(catalog, id).length,
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => GradebookDetailPage(
                    book: book,
                    title: _subjectLine(catalog, id),
                    students: _students(catalog, id),
                  ),
                ),
              ),
            ),
        ],
        const PortalHint(
          'Lançar e alterar notas, submeter e fechar pautas faz-se no portal '
          'SIGA Plus ou no desktop.',
        ),
      ];
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
            for (final (i, child) in children.indexed)
              Entrance(index: i, child: child),
          ],
        ),
      );
    },
  );

  String _subjectLine(AcademicCatalog catalog, String id) {
    final match = catalog.classes.where((c) => c['classSubjectId'] == id);
    if (match.isEmpty) return 'Disciplina';
    return '${match.first['subjectName']} · ${match.first['className']}';
  }

  /// Alunos da disciplina: enrollmentId → nome.
  Map<String, String> _students(AcademicCatalog catalog, String id) => {
    for (final c in catalog.classes)
      if (c['classSubjectId'] == id)
        for (final st in (c['students'] as List? ?? []))
          if (st is Map && st['enrollmentId'] is String && st['name'] is String)
            st['enrollmentId'] as String: st['name'] as String,
  };
}

class _BookCard extends StatelessWidget {
  const _BookCard({
    required this.book,
    required this.students,
    required this.onTap,
  });
  final Map<String, dynamic> book;
  final int students;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final palette = SigaPalette.of(context);
    final items = [
      for (final i in (book['items'] as List? ?? []))
        if (i is Map) i,
    ];
    final launched = items.fold<int>(
      0,
      (sum, i) =>
          sum +
          (i['scores'] as List? ?? [])
              .whereType<Map>()
              .where((s) => s['value'] is num)
              .length,
    );
    final expected = items.length * students;
    final progress = expected == 0 ? null : launched / expected;
    final (label, color) = gradebookStatus(book['status']);
    return Padding(
      padding: const EdgeInsets.only(bottom: Siga.s1),
      child: SigaCard(
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const IconBadge(FluentIcons.table_24_regular, size: 40),
                const SizedBox(width: Siga.s2),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${(book['term'] as Map?)?['name'] ?? 'Período'}',
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      Text(
                        '${items.length} '
                        '${items.length == 1 ? 'elemento' : 'elementos'} de avaliação',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
                _Pill(label, color),
              ],
            ),
            if (progress != null) ...[
              const SizedBox(height: 12),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: progress.clamp(0, 1).toDouble(),
                  minHeight: 5,
                  backgroundColor: palette.surface2,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                '$launched de $expected notas lançadas',
                style: TextStyle(fontSize: 12, color: palette.ink2),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Uma pauta aberta: elementos de avaliação e as notas de cada aluno.
class GradebookDetailPage extends StatefulWidget {
  const GradebookDetailPage({
    super.key,
    required this.book,
    required this.title,
    required this.students,
  });
  final Map<String, dynamic> book;
  final String title;
  final Map<String, String> students;
  @override
  State<GradebookDetailPage> createState() => _GradebookDetailPageState();
}

class _GradebookDetailPageState extends State<GradebookDetailPage> {
  int item = 0;

  @override
  Widget build(BuildContext context) {
    final palette = SigaPalette.of(context);
    final items =
        [
          for (final i in (widget.book['items'] as List? ?? []))
            if (i is Map) i,
        ]..sort(
          (a, b) => (a['sequence'] as num? ?? 0).compareTo(
            b['sequence'] as num? ?? 0,
          ),
        );
    final current = items.isEmpty
        ? null
        : items[item.clamp(0, items.length - 1)];
    final scores = {
      for (final s in (current?['scores'] as List? ?? []))
        if (s is Map && s['enrollmentId'] is String) s['enrollmentId']: s,
    };
    final values = [
      for (final s in scores.values)
        if (s['value'] is num) s['value'] as num,
    ];
    final mean = values.isEmpty
        ? null
        : values.reduce((a, b) => a + b) / values.length;
    final max = current?['maxScore'] is num ? current!['maxScore'] as num : 20;
    final (label, color) = gradebookStatus(widget.book['status']);
    final names = widget.students.entries.toList()
      ..sort((a, b) => a.value.compareTo(b.value));
    return Scaffold(
      appBar: AppBar(title: const Text('Pauta')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(Siga.s3, 0, Siga.s3, Siga.s4),
        children: [
          Text(
            widget.title,
            style: TextStyle(fontSize: 13, color: palette.ink2),
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Expanded(
                child: Text(
                  '${(widget.book['term'] as Map?)?['name'] ?? 'Período'}',
                  style: const TextStyle(
                    fontSize: 26,
                    fontWeight: FontWeight.w700,
                    letterSpacing: -.5,
                  ),
                ),
              ),
              _Pill(label, color),
            ],
          ),
          const SizedBox(height: Siga.s2),
          if (items.isEmpty)
            const EmptyState(message: 'Esta pauta ainda não tem elementos.')
          else ...[
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  for (final (i, it) in items.indexed)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
                        label: Text('${it['code'] ?? it['name']}'),
                        selected: i == item,
                        onSelected: (_) => setState(() => item = i),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: Siga.s2),
            SigaCard(
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${current!['name']}',
                          style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        Text(
                          [
                            'Escala 0–${scoreText(max)}',
                            if (current['assessedOn'] is String)
                              'Avaliado em ${_day(current['assessedOn'] as String)}',
                          ].join(' · '),
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        mean == null ? '—' : scoreText(mean),
                        style: const TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      Text(
                        'Média da turma',
                        style: TextStyle(fontSize: 11, color: palette.ink2),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            SectionHeader('${values.length} de ${names.length} lançadas'),
            for (final MapEntry(key: enrollment, value: name) in names)
              () {
                final score = scores[enrollment];
                final value = score?['value'];
                final below = value is num && value < max / 2;
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Row(
                    children: [
                      InitialsAvatar(name, size: 36),
                      const SizedBox(width: 12),
                      Expanded(child: Text(name)),
                      if (score?['status'] == 'locked')
                        Padding(
                          padding: const EdgeInsets.only(right: 6),
                          child: Icon(
                            FluentIcons.lock_closed_24_regular,
                            size: 16,
                            color: palette.ink2,
                          ),
                        ),
                      Text(
                        value is num ? scoreText(value) : '—',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: value is! num
                              ? palette.ink2
                              : below
                              ? const Color(0xffd92c3a)
                              : null,
                        ),
                      ),
                    ],
                  ),
                );
              }(),
          ],
          const SizedBox(height: Siga.s1),
          Text(
            'Notas abaixo de metade da escala a vermelho; cadeado nas já '
            'bloqueadas.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const PortalHint(
            'Para lançar ou corrigir notas desta pauta, use o portal SIGA Plus '
            'ou o desktop.',
          ),
        ],
      ),
    );
  }

  String _day(String iso) {
    final d = DateTime.tryParse(iso);
    return d == null ? iso : '${d.day}/${d.month}/${d.year}';
  }
}

class _Pill extends StatelessWidget {
  const _Pill(this.label, this.color);
  final String label;
  final Color color;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
    decoration: BoxDecoration(
      color: color.withValues(alpha: .12),
      borderRadius: BorderRadius.circular(20),
    ),
    child: Text(
      label,
      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: color),
    ),
  );
}
