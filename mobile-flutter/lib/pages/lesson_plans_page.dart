import 'package:flutter/material.dart';
import 'package:fluentui_system_icons/fluentui_system_icons.dart';
import '../academic.dart';
import '../design/tokens.dart';
import '../design/widgets.dart';
import '../gateway.dart';

/// Planos de aula do professor, por disciplina e trimestre, com o conteúdo
/// e as avaliações previstas. Só consulta: criar e editar fica no portal.
class LessonPlansPage extends StatefulWidget {
  const LessonPlansPage({super.key, required this.gateway});
  final MobileGateway gateway;
  @override
  State<LessonPlansPage> createState() => _LessonPlansPageState();
}

class _LessonPlansPageState extends State<LessonPlansPage> {
  late Future<(AcademicCatalog, List<Map<String, dynamic>>)> data;
  int term = 0; // 0 = todos

  @override
  void initState() {
    super.initState();
    load();
  }

  void load() {
    data = () async {
      final results = await Future.wait([
        widget.gateway.read('academic'),
        widget.gateway.read('lesson-plans'),
      ]);
      final plans = results[1]['plans'];
      if (plans is! List || plans.any((p) => p is! Map<String, dynamic>)) {
        throw const FormatException('Planos inválidos.');
      }
      return (
        AcademicCatalog.parse(results[0]),
        plans.cast<Map<String, dynamic>>(),
      );
    }();
  }

  String subject(AcademicCatalog catalog, dynamic id) {
    final match = catalog.classes.where((c) => c['classSubjectId'] == id);
    return match.isEmpty
        ? 'Disciplina'
        : '${match.first['subjectName']} · ${match.first['className']}';
  }

  void open(Map<String, dynamic> plan, String subjectLine) {
    final components = [
      for (final c in (plan['components'] as List? ?? []))
        if (c is Map) c,
    ];
    showSigaSheet<void>(
      context,
      title: '${plan['title']}',
      builder: (sheet) {
        final palette = SigaPalette.of(sheet);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              '$subjectLine · ${plan['term']}.º trimestre',
              style: TextStyle(color: palette.ink2, fontSize: 13),
            ),
            const SizedBox(height: Siga.s2),
            Text(
              plan['content'] is String &&
                      (plan['content'] as String).isNotEmpty
                  ? plan['content'] as String
                  : 'Sem texto no plano.',
              style: const TextStyle(height: 1.5),
            ),
            if (components.isNotEmpty) ...[
              const SectionHeader('Avaliações previstas'),
              for (final c in components)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Row(
                    children: [
                      Icon(
                        c['kind'] == 'prova'
                            ? FluentIcons.document_edit_24_regular
                            : FluentIcons.clipboard_task_24_regular,
                        size: 20,
                      ),
                      const SizedBox(width: 10),
                      Expanded(child: Text('${c['name']}')),
                      Text(
                        '${c['plannedCount']}× '
                        '${c['kind'] == 'prova' ? 'prova' : 'avaliação'}',
                        style: TextStyle(color: palette.ink2, fontSize: 13),
                      ),
                    ],
                  ),
                ),
            ],
            if (plan['fileName'] is String) ...[
              const SizedBox(height: Siga.s2),
              Row(
                children: [
                  Icon(
                    FluentIcons.attach_24_regular,
                    size: 18,
                    color: palette.ink2,
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      '${plan['fileName']} · abre-se no portal',
                      style: TextStyle(color: palette.ink2, fontSize: 13),
                    ),
                  ),
                ],
              ),
            ],
          ],
        );
      },
    );
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
            message: 'Não foi possível carregar os planos de aula.',
            action: 'Tentar novamente',
            onAction: () => setState(load),
          ),
        );
      }
      final (catalog, all) = snapshot.data!;
      final plans = [
        for (final p in all)
          if (term == 0 || p['term'] == term) p,
      ];
      final bySubject = <String, List<Map<String, dynamic>>>{};
      for (final p in plans) {
        (bySubject[p['classSubjectId'] as String? ?? ''] ??= []).add(p);
      }
      final children = <Widget>[
        Segmented(
          options: const ['Todos', '1.º trim.', '2.º trim.', '3.º trim.'],
          selected: term,
          onSelected: (i) => setState(() => term = i),
        ),
        if (plans.isEmpty)
          const EmptyState(message: 'Sem planos de aula para este filtro.'),
        for (final MapEntry(key: id, value: list) in bySubject.entries) ...[
          SectionHeader(subject(catalog, id)),
          for (final plan in list)
            Padding(
              padding: const EdgeInsets.only(bottom: Siga.s1),
              child: SigaCard(
                onTap: () => open(plan, subject(catalog, id)),
                child: Row(
                  children: [
                    const IconBadge(FluentIcons.notebook_24_regular, size: 40),
                    const SizedBox(width: Siga.s2),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${plan['title']}',
                            style: const TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          Text(
                            '${plan['term']}.º trimestre'
                            '${(plan['components'] as List? ?? []).isEmpty ? '' : ' · ${(plan['components'] as List).length} avaliações previstas'}',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ],
                      ),
                    ),
                    StatusTag(
                      plan['status'] == 'published' ? 'Publicado' : 'Rascunho',
                      accent: plan['status'] == 'published',
                    ),
                  ],
                ),
              ),
            ),
        ],
        const SizedBox(height: Siga.s2),
        Text(
          'Consulta dos planos do SIGA. Criar e editar planos faz-se no '
          'portal.',
          style: Theme.of(context).textTheme.bodySmall,
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
}
