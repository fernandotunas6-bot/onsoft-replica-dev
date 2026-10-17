import 'dart:async';
import 'package:flutter/material.dart';
import 'package:fluentui_system_icons/fluentui_system_icons.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'academic.dart';
import 'chat_history.dart';
import 'design/tokens.dart';
import 'design/widgets.dart';
import 'gateway.dart';
import 'pages/attendance_page.dart';
import 'pages/subject_page.dart';
import 'pages/task_sheet.dart';

const weekdays = [
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
  'Domingo',
];
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

/// Ecrãs com dados da escola activa (ecrãs 7–10 das referências e a página da
/// turma). Os dados vêm só do gateway — o servidor decide a autorização; aqui
/// decide-se a apresentação. O que o servidor ainda não fornece (progresso,
/// pré-visualização da última mensagem, fotografias) não é inventado.
class DataPage extends StatefulWidget {
  const DataPage({
    super.key,
    required this.gateway,
    required this.path,
    required this.name,
    this.groupId,
    this.schoolName,
  });
  final MobileGateway gateway;
  final String path;
  final String name;
  final String? groupId;
  final String? schoolName;
  @override
  State<DataPage> createState() => _DataPageState();
}

class _DataPageState extends State<DataPage> with SyncedState {
  @override
  void resync() => load();

  late Future<Map<String, dynamic>> data;
  Timer? clock;
  String query = '';
  bool searching = false;
  int subjectFilter = 0;
  int calendarView = 0;

  /// Mensagens: 0 Todas, 1 Não lidas, 2 Favoritas.
  int chatFilter = 0;

  /// Conversas marcadas como favoritas neste dispositivo (toque longo).
  Set<String> favorites = {};
  String get favoritesKey =>
      'favorite-threads:${widget.gateway.schoolId}:${widget.gateway.userId}';
  DateTime selected = luandaClock(DateTime.now());

  @override
  void initState() {
    super.initState();
    load();
    if (widget.path == '/messages') unawaited(loadFavorites());
    clock = Timer.periodic(const Duration(minutes: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  Future<void> loadFavorites() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getStringList(favoritesKey) ?? const [];
    if (mounted) setState(() => favorites = saved.toSet());
  }

  Future<void> toggleFavorite(String id, String name) async {
    final added = !favorites.contains(id);
    setState(() => added ? favorites.add(id) : favorites.remove(id));
    ScaffoldMessenger.maybeOf(context)?.showSnackBar(
      SnackBar(
        content: Text(
          added ? '$name nas favoritas.' : '$name saiu das favoritas.',
        ),
      ),
    );
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(favoritesKey, favorites.toList());
  }

  @override
  void dispose() {
    clock?.cancel();
    super.dispose();
  }

  /// Professor, no início: chamadas por fechar dos últimos 14 dias.
  Future<int>? pendingCalls;

  void load() {
    data = widget.gateway.read(
      widget.path == '/messages' ? 'chat' : 'academic',
    );
    if (widget.path == '/home' && widget.gateway.role == 'professor') {
      final today = luandaClock(DateTime.now());
      String day(DateTime d) =>
          '${d.year}-${d.month.toString().padLeft(2, '0')}-'
          '${d.day.toString().padLeft(2, '0')}';
      pendingCalls = widget.gateway
          .attendanceBetween(
            day(today.subtract(const Duration(days: 13))),
            day(today),
          )
          .then(
            (r) => (r['sessions'] as List)
                .where((s) => s is Map && s['status'] == 'pending')
                .length,
          );
    }
  }

  bool matches(String value) => value.toLowerCase().contains(query);

  String deadline(dynamic due) {
    if (due == null) return 'Sem prazo indicado';
    final local = luandaClock(DateTime.parse(due as String));
    return '${local.day}/${local.month}/${local.year} · '
        '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
  }

  String hours(Map<String, dynamic> slot) =>
      '${(slot['startsAt'] as String).substring(0, 5)} – '
      '${(slot['endsAt'] as String).substring(0, 5)}';

  bool overdue(Map<String, dynamic> task) =>
      task['due'] is String &&
      DateTime.parse(task['due'] as String).isBefore(DateTime.now());

  List<Map<String, dynamic>> sortedTasks(
    Iterable<Map<String, dynamic>> tasks,
  ) => tasks.toList()
    ..sort(
      (a, b) => (a['due'] as String? ?? '9999').compareTo(
        b['due'] as String? ?? '9999',
      ),
    );

  String plural(int n, String one, String many) =>
      n == 1 ? '1 $one' : '$n $many';

  /// Cor estável de cada disciplina: a ordem em que aparece no catálogo.
  Color subjectColor(AcademicCatalog catalog, dynamic classSubjectId) {
    final index = catalog.classes.indexWhere(
      (c) => c['classSubjectId'] == classSubjectId,
    );
    return Siga.subjectColor(index < 0 ? 0 : index);
  }

  IconData icon(IconData line, IconData classic) =>
      AppearanceScope.icon(context, line, classic);

  /// Ícone de cada disciplina, pela mesma ordem das cores (ecrã 8).
  static const subjectIcons = [
    (FluentIcons.cube_24_regular, FluentIcons.cube_24_filled),
    (FluentIcons.document_text_24_regular, FluentIcons.document_text_24_filled),
    (FluentIcons.beaker_24_regular, FluentIcons.beaker_24_filled),
    (FluentIcons.table_24_regular, FluentIcons.table_24_filled),
    (FluentIcons.chat_multiple_24_regular, FluentIcons.chat_multiple_24_filled),
    (FluentIcons.book_open_24_regular, FluentIcons.book_open_24_filled),
  ];

  IconData subjectIcon(AcademicCatalog catalog, dynamic classSubjectId) {
    final index = catalog.classes.indexWhere(
      (c) => c['classSubjectId'] == classSubjectId,
    );
    final (outlined, modern) =
        subjectIcons[(index < 0 ? 0 : index) % subjectIcons.length];
    return icon(outlined, modern);
  }

  // ───────── Folhas de detalhe ─────────

  /// Abre a disciplina numa página própria; ao voltar pode pedir um destino
  /// (ex.: a assiduidade leva às Faltas).
  Future<void> subjectDetail(
    Map<String, dynamic> item,
    AcademicCatalog catalog,
  ) async {
    final route = await Navigator.of(context).push<String>(
      MaterialPageRoute(
        builder: (_) => SubjectPage(
          gateway: widget.gateway,
          catalog: catalog,
          item: item,
          color: subjectColor(catalog, item['classSubjectId']),
          icon: subjectIcon(catalog, item['classSubjectId']),
        ),
      ),
    );
    if (route != null && mounted) context.go(route);
  }

  void taskDetail(Map<String, dynamic> task, AcademicCatalog catalog) =>
      showTaskSheet(
        context,
        task,
        subject: catalog.subject(task['classSubjectId']),
        student: widget.gateway.role == 'aluno',
      );

  // ───────── Peças ─────────

  /// Título de ecrã com a lupa à direita (ecrãs 8–10).
  Widget titleRow(String title, {bool search = true}) => Padding(
    padding: const EdgeInsets.only(bottom: Siga.s2),
    child: Row(
      children: [
        Expanded(
          child: Semantics(
            header: true,
            child: Text(
              title,
              style: const TextStyle(
                fontSize: 26,
                fontWeight: FontWeight.w700,
                letterSpacing: -.5,
              ),
            ),
          ),
        ),
        if (search)
          IconButton(
            tooltip: searching ? 'Fechar pesquisa' : 'Pesquisar',
            onPressed: () => setState(() {
              searching = !searching;
              if (!searching) query = '';
            }),
            icon: Icon(
              searching
                  ? FluentIcons.dismiss_24_regular
                  : FluentIcons.search_24_regular,
            ),
          ),
      ],
    ),
  );

  Widget searchField(String hint, {bool always = false}) =>
      !always && !searching
      ? const SizedBox.shrink()
      : Padding(
          padding: const EdgeInsets.only(bottom: Siga.s2),
          child: TextField(
            autofocus: !always,
            decoration: InputDecoration(
              hintText: hint,
              prefixIcon: const Icon(FluentIcons.search_24_regular, size: 20),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(24),
                borderSide: BorderSide.none,
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(24),
                borderSide: BorderSide.none,
              ),
            ),
            onChanged: (value) => setState(() {
              query = value.trim().toLowerCase();
            }),
          ),
        );

  /// Linha de disciplina (ecrãs 7 e 8): ícone na cor da disciplina, nome,
  /// turma e número de tarefas.
  Widget subjectCard(Map<String, dynamic> item, AcademicCatalog catalog) {
    final count = catalog.tasks
        .where((t) => t['classSubjectId'] == item['classSubjectId'])
        .length;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: SigaCard(
        onTap: () => subjectDetail(item, catalog),
        padding: const EdgeInsets.all(12),
        semanticLabel: '${item['subjectName']}, ${item['className']}',
        child: Row(
          children: [
            TintIcon(
              subjectIcon(catalog, item['classSubjectId']),
              color: subjectColor(catalog, item['classSubjectId']),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${item['subjectName']}',
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${item['className']} · ${plural(count, 'tarefa', 'tarefas')}',
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

  /// Aula no horário (ecrã 9): barra na cor da disciplina, nome, hora e sala.
  /// Aula do horário. Tocar abre a disciplina. Num dia de hoje, a aula a
  /// decorrer leva «Agora» e as que já acabaram ficam esbatidas.
  Widget slotRow(
    Map<String, dynamic> slot,
    AcademicCatalog catalog, {
    DateTime? day,
  }) {
    final legacy = slot['publication'] == 'legacy';
    final now = luandaClock(DateTime.now());
    final isToday =
        day != null &&
        day.year == now.year &&
        day.month == now.month &&
        day.day == now.day;
    final minute = now.hour * 60 + now.minute;
    final starts = minutes(slot['startsAt']) ?? 0;
    final ends = minutes(slot['endsAt']) ?? 0;
    final running = isToday && starts <= minute && minute < ends;
    final over = isToday && minute >= ends;
    final subject = catalog.classes.where(
      (c) => c['classSubjectId'] == slot['classSubjectId'],
    );
    return Opacity(
      opacity: over ? .5 : 1,
      child: InkWell(
        borderRadius: BorderRadius.circular(Siga.rSmall),
        onTap: subject.isEmpty
            ? null
            : () => subjectDetail(subject.first, catalog),
        child: slotBody(slot, catalog, legacy: legacy, running: running),
      ),
    );
  }

  Widget slotBody(
    Map<String, dynamic> slot,
    AcademicCatalog catalog, {
    required bool legacy,
    required bool running,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              width: 4,
              decoration: BoxDecoration(
                color: legacy
                    ? Theme.of(context).colorScheme.outline
                    : subjectColor(catalog, slot['classSubjectId']),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    catalog.subject(slot['classSubjectId']),
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${hours(slot)} · ${slot['room'] ?? 'Sala por indicar'}',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  if (legacy)
                    Text(
                      'Horário legado: confirme com a escola',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                ],
              ),
            ),
            if (running)
              const Align(
                alignment: Alignment.center,
                child: StatusTag('Agora', accent: true),
              ),
          ],
        ),
      ),
    );
  }

  Widget taskRow(
    Map<String, dynamic> task,
    AcademicCatalog catalog, {
    bool showSubject = true,
  }) => TaskTile(
    task: task,
    subject: showSubject ? catalog.subject(task['classSubjectId']) : null,
    icon: icon(
      FluentIcons.task_list_ltr_24_regular,
      FluentIcons.task_list_ltr_24_filled,
    ),
    onTap: () => taskDetail(task, catalog),
  );

  // ───────── Ecrãs ─────────

  /// Início (ecrã 7).
  List<Widget> home(AcademicCatalog catalog) {
    final now = luandaClock(DateTime.now());
    final next = catalog.upcoming(DateTime.now());
    final isTeacher = widget.gateway.role == 'professor';
    final first = widget.name.trim().split(RegExp(r'\s+')).first;
    final tasks = sortedTasks(catalog.tasks.where((t) => !overdue(t)));
    final className = !isTeacher && catalog.classes.isNotEmpty
        ? catalog.classes.first['className'] as String
        : widget.schoolName;
    return [
      Row(
        children: [
          Semantics(
            button: true,
            label: 'Abrir menu',
            excludeSemantics: true,
            child: GestureDetector(
              onTap: () => Scaffold.maybeOf(context)?.openDrawer(),
              child: InitialsAvatar(widget.name, size: 52),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Semantics(
                  header: true,
                  child: Text(
                    first.isEmpty ? 'Bem-vindo!' : 'Bem-vindo, $first!',
                    style: const TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w700,
                      letterSpacing: -.4,
                    ),
                  ),
                ),
                Text(
                  [isTeacher ? 'Professor' : 'Aluno', ?className].join(' · '),
                  style: Theme.of(context).textTheme.bodySmall,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          NoticeBell(
            onPressed: () => context.go('/more/notifications'),
            icon: icon(
              FluentIcons.alert_24_regular,
              FluentIcons.alert_24_filled,
            ),
          ),
        ],
      ),
      const SizedBox(height: Siga.s3),
      if (next != null)
        nextLesson(next, catalog, now)
      else
        SigaCard(
          child: Row(
            children: [
              const IconBadge(FluentIcons.calendar_checkmark_24_regular),
              const SizedBox(width: Siga.s2),
              Expanded(
                child: Text(
                  'Sem mais aulas publicadas para hoje.',
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ),
            ],
          ),
        ),
      if (pendingCalls != null)
        FutureBuilder<int>(
          future: pendingCalls,
          builder: (context, snapshot) {
            final count = snapshot.data ?? 0;
            if (count == 0) return const SizedBox.shrink();
            return Padding(
              padding: const EdgeInsets.only(top: Siga.s1),
              child: SigaCard(
                onTap: () => context.go('/more/absences'),
                child: Row(
                  children: [
                    const IconBadge(
                      FluentIcons.clipboard_task_24_regular,
                      accent: true,
                    ),
                    const SizedBox(width: Siga.s2),
                    Expanded(
                      child: Text(
                        count == 1
                            ? '1 chamada por fechar nos últimos 14 dias'
                            : '$count chamadas por fechar nos últimos 14 dias',
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                    ),
                    const Icon(FluentIcons.chevron_right_24_regular, size: 20),
                  ],
                ),
              ),
            );
          },
        ),
      SectionHeader(
        'Disciplinas',
        action: 'Ver todas',
        onAction: () => context.go('/subjects'),
      ),
      if (catalog.classes.isEmpty)
        const EmptyState(message: 'Sem disciplinas neste vínculo.'),
      for (final item in catalog.classes.take(3)) subjectCard(item, catalog),
      SectionHeader(
        'Próximas actividades',
        action: 'Ver todos',
        onAction: () => context.go('/more/tasks'),
      ),
      if (tasks.isEmpty)
        const EmptyState(message: 'Sem actividades por entregar.'),
      for (final task in tasks.take(4)) taskRow(task, catalog),
    ];
  }

  /// Cartão «Aula agora» do ecrã 7: barra azul, disciplina, hora e «Entrar».
  Widget nextLesson(
    Map<String, dynamic> next,
    AcademicCatalog catalog,
    DateTime now,
  ) {
    final scheme = Theme.of(context).colorScheme;
    final running = minutes(next['startsAt'])! <= now.hour * 60 + now.minute;
    final subject = catalog.classes.firstWhere(
      (c) => c['classSubjectId'] == next['classSubjectId'],
    );
    final teaches =
        widget.gateway.role == 'professor' &&
        subject['teacher'] is Map &&
        (subject['teacher'] as Map)['userId'] == widget.gateway.userId;
    return SigaCard(
      padding: EdgeInsets.zero,
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(width: 5, color: scheme.primary),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(Siga.s2),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            running ? 'Aula agora' : 'Próxima aula',
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            catalog.subject(next['classSubjectId']),
                            style: const TextStyle(
                              fontSize: 17,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            '${hours(next)} · ${next['room'] ?? 'Sala por indicar'}',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ],
                      ),
                    ),
                    FilledButton(
                      // Professor da disciplina: a rotina é a chamada.
                      onPressed: teaches
                          ? () => takeAttendance([subject])
                          : () => subjectDetail(subject, catalog),
                      style: FilledButton.styleFrom(
                        minimumSize: const Size(76, 40),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(Siga.rSmall),
                        ),
                      ),
                      child: Text(teaches ? 'Chamada' : 'Entrar'),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Disciplinas (ecrã 8). «Em andamento»: com tarefas por entregar;
  /// «Concluídas»: com tarefas e nenhuma por entregar.
  List<Widget> subjectsScreen(AcademicCatalog catalog) {
    bool open(Map<String, dynamic> c) => catalog.tasks.any(
      (t) => t['classSubjectId'] == c['classSubjectId'] && !overdue(t),
    );
    bool any(Map<String, dynamic> c) =>
        catalog.tasks.any((t) => t['classSubjectId'] == c['classSubjectId']);
    final subjects = catalog.classes.where((c) {
      if (!matches('${c['subjectName']} ${c['className']}')) return false;
      return switch (subjectFilter) {
        1 => open(c),
        2 => any(c) && !open(c),
        _ => true,
      };
    }).toList();
    return [
      titleRow('Disciplinas'),
      searchField('Pesquisar disciplina…'),
      Segmented(
        options: const ['Todas', 'Em andamento', 'Concluídas'],
        selected: subjectFilter,
        onSelected: (i) => setState(() => subjectFilter = i),
      ),
      const SizedBox(height: Siga.s2),
      if (subjects.isEmpty)
        const EmptyState(
          message: 'Sem disciplinas para os filtros escolhidos.',
        ),
      for (final item in subjects) subjectCard(item, catalog),
    ];
  }

  /// Calendário (ecrã 9): Agenda do dia ou Horários da semana.
  List<Widget> calendarScreen(AcademicCatalog catalog) {
    final scheme = Theme.of(context).colorScheme;
    final palette = SigaPalette.of(context);
    final today = luandaClock(DateTime.now());
    final monday = DateTime(
      selected.year,
      selected.month,
      selected.day,
    ).subtract(Duration(days: selected.weekday - 1));
    final week = [for (var i = 0; i < 5; i++) monday.add(Duration(days: i))];
    bool same(DateTime a, DateTime b) =>
        a.year == b.year && a.month == b.month && a.day == b.day;
    final dayLabel = same(selected, today)
        ? 'Hoje'
        : weekdays[selected.weekday - 1];
    final slots = catalog
        .forDay(selected)
        .where((s) => matches(catalog.subject(s['classSubjectId'])))
        .toList();
    // Entregas com prazo em cada dia (relógio de Luanda).
    List<Map<String, dynamic>> dueOn(DateTime day) => [
      for (final t in catalog.tasks)
        if (t['due'] is String &&
            same(luandaClock(DateTime.parse(t['due'] as String)), day))
          t,
    ];
    final dueToday = dueOn(selected);
    return [
      titleRow('Calendário'),
      searchField('Pesquisar disciplina…'),
      Segmented(
        options: const ['Agenda', 'Horários'],
        selected: calendarView,
        expanded: true,
        onSelected: (i) => setState(() => calendarView = i),
      ),
      const SizedBox(height: Siga.s2),
      if (calendarView == 0) ...[
        GestureDetector(
          // Deslizar muda de semana.
          onHorizontalDragEnd: (details) {
            final v = details.primaryVelocity ?? 0;
            if (v.abs() < 200) return;
            setState(() {
              selected = selected.add(Duration(days: v < 0 ? 7 : -7));
            });
          },
          child: Row(
            children: [
              for (final day in week)
                Expanded(
                  child: Semantics(
                    button: true,
                    selected: same(day, selected),
                    label:
                        '${weekdays[day.weekday - 1]}, ${day.day} de ${months[day.month - 1]}',
                    excludeSemantics: true,
                    child: InkWell(
                      borderRadius: BorderRadius.circular(Siga.rSmall),
                      onTap: () => setState(() => selected = day),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 6),
                        child: Column(
                          children: [
                            Text(
                              weekdays[day.weekday - 1].substring(0, 3),
                              style: TextStyle(
                                fontSize: 12,
                                color: same(day, selected) || same(day, today)
                                    ? scheme.primary
                                    : palette.ink2,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                            const SizedBox(height: 6),
                            AnimatedContainer(
                              duration: Siga.motion(context, Siga.quick),
                              width: 34,
                              height: 34,
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                color: same(day, selected)
                                    ? scheme.primary
                                    : Colors.transparent,
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Text(
                                '${day.day}',
                                style: TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w600,
                                  color: same(day, selected)
                                      ? Colors.white
                                      : scheme.onSurface,
                                ),
                              ),
                            ),
                            const SizedBox(height: 4),
                            // Ponto: há entregas neste dia.
                            Container(
                              width: 5,
                              height: 5,
                              decoration: BoxDecoration(
                                color: dueOn(day).isEmpty
                                    ? Colors.transparent
                                    : const Color(0xffe8890c),
                                shape: BoxShape.circle,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.only(top: Siga.s3, bottom: Siga.s2),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  '$dayLabel · ${selected.day} de ${months[selected.month - 1]}',
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              if (!same(selected, today))
                TextButton(
                  onPressed: () => setState(() => selected = today),
                  child: const Text('Hoje'),
                ),
            ],
          ),
        ),
        if (slots.isEmpty) const EmptyState(message: 'Sem aulas neste dia.'),
        for (final slot in slots) slotRow(slot, catalog, day: selected),
        if (dueToday.isNotEmpty) ...[
          SectionHeader('Entregas neste dia (${dueToday.length})'),
          for (final task in dueToday) taskRow(task, catalog),
        ],
      ] else ...[
        for (var d = 0; d < 5; d++) ...[
          SectionHeader(weekdays[d]),
          ...() {
            final day = monday.add(Duration(days: d));
            final list = catalog
                .forDay(day)
                .where((s) => matches(catalog.subject(s['classSubjectId'])))
                .toList();
            return list.isEmpty
                ? [
                    Text(
                      'Sem aulas.',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ]
                : [for (final slot in list) slotRow(slot, catalog, day: day)];
          }(),
        ],
      ],
      const SizedBox(height: Siga.s2),
      Text(
        'Horário publicado pela escola. Toque numa aula para abrir a '
        'disciplina; o ponto laranja marca dias com entregas.',
        style: Theme.of(context).textTheme.bodySmall,
      ),
    ];
  }

  /// Mensagens (ecrã 10).
  List<Widget> chatScreen(Map<String, dynamic> result) {
    if (result['threads'] is! List) {
      return [
        titleRow('Mensagens', search: false),
        const EmptyState(
          message: 'Não foi possível interpretar a lista de conversas.',
        ),
      ];
    }
    final threads = [
      for (final thread in result['threads'] as List)
        if (thread is Map && thread['name'] is String) thread,
    ];
    int unread(Map thread) =>
        thread['unread'] is int ? thread['unread'] as int : 0;
    final unreadThreads = threads.where((t) => unread(t) > 0).length;
    final shown = threads
        .where(
          (t) =>
              matches(t['name'] as String) &&
              switch (chatFilter) {
                1 => unread(t) > 0,
                2 => favorites.contains(t['id']),
                _ => true,
              },
        )
        .toList();
    final scheme = Theme.of(context).colorScheme;
    String pending(int count) => count == 0
        ? 'Sem mensagens por ler'
        : count == 1
        ? '1 mensagem por ler'
        : '$count mensagens por ler';
    return [
      titleRow('Mensagens', search: false),
      searchField('Pesquisar conversas…', always: true),
      Segmented(
        options: const ['Todas', 'Não lidas', 'Favoritas'],
        selected: chatFilter,
        badges: {1: unreadThreads},
        onSelected: (i) => setState(() => chatFilter = i),
      ),
      const SizedBox(height: Siga.s1),
      if (threads.isEmpty)
        const EmptyState(message: 'Sem conversas nesta escola.')
      else if (shown.isEmpty)
        EmptyState(
          message: chatFilter == 2
              ? 'Sem favoritas. Toque longo numa conversa para a marcar.'
              : 'Sem conversas para os filtros escolhidos.',
        ),
      for (final thread in shown)
        ListTile(
          contentPadding: const EdgeInsets.symmetric(vertical: 4),
          leading: InitialsAvatar(thread['name'] as String, size: 46),
          title: Text(
            thread['name'] as String,
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
          subtitle: Text(pending(unread(thread))),
          onLongPress: thread['id'] is! String
              ? null
              : () => toggleFavorite(
                  thread['id'] as String,
                  thread['name'] as String,
                ),
          onTap: thread['id'] is! String
              ? null
              : () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => ChatHistoryPage(
                      gateway: widget.gateway,
                      id: thread['id'] as String,
                      name: thread['name'] as String,
                    ),
                  ),
                ),
          trailing: unread(thread) == 0
              ? (favorites.contains(thread['id'])
                    ? Icon(
                        FluentIcons.star_24_filled,
                        color: scheme.primary,
                        size: 20,
                      )
                    : null)
              : Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 7,
                    vertical: 2,
                  ),
                  decoration: BoxDecoration(
                    color: scheme.primary,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    '${unread(thread)}',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
        ),
      const SizedBox(height: Siga.s2),
      Text(
        'Conversas sincronizadas com o SIGA. Toque longo numa conversa para '
        'a marcar como favorita.',
        style: Theme.of(context).textTheme.bodySmall,
      ),
    ];
  }

  List<Widget> classesScreen(AcademicCatalog catalog) {
    final groups = <String, List<Map<String, dynamic>>>{};
    for (final item in catalog.classes) {
      final id = item['classGroupId'];
      if (id is String && matches('${item['className']}')) {
        (groups[id] ??= []).add(item);
      }
    }
    return [
      searchField('Pesquisar turma…', always: true),
      if (groups.isEmpty)
        const EmptyState(
          message: 'Sem turmas autorizadas para os filtros escolhidos.',
        ),
      for (final group in groups.entries)
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: SigaCard(
            onTap: () =>
                context.go('/more/classes/${Uri.encodeComponent(group.key)}'),
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                TintIcon(
                  icon(
                    FluentIcons.people_team_24_regular,
                    FluentIcons.people_team_24_filled,
                  ),
                  color: Theme.of(context).colorScheme.primary,
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        group.value.first['className'] as String,
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      Text(
                        plural(group.value.length, 'disciplina', 'disciplinas'),
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
                const Icon(FluentIcons.chevron_right_24_regular, size: 20),
              ],
            ),
          ),
        ),
    ];
  }

  /// Página da turma, como na referência: «Turma · …», título, cápsulas
  /// Disciplinas / Professores / Aulas e os cinco serviços da turma.
  List<Widget> classScreen(AcademicCatalog catalog) {
    final subjects = catalog.classes
        .where((c) => c['classGroupId'] == widget.groupId)
        .toList();
    if (subjects.isEmpty) {
      return const [
        EmptyState(
          message: 'Esta turma não está disponível no seu contexto actual.',
        ),
      ];
    }
    final ids = {for (final s in subjects) s['classSubjectId']};
    final tasks = sortedTasks(
      catalog.tasks.where((t) => ids.contains(t['classSubjectId'])),
    );
    final teachers = <String>{};
    for (final s in subjects) {
      final teacher = s['teacher'];
      if (teacher is Map && teacher['name'] is String) {
        teachers.add(teacher['name'] as String);
      }
    }
    final today = luandaClock(DateTime.now());
    final todaySlots = catalog
        .forDay(today)
        .where((s) => ids.contains(s['classSubjectId']))
        .toList();
    final palette = SigaPalette.of(context);
    Widget row(IconData i, String title, String subtitle, VoidCallback onTap) =>
        InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(Siga.rMedium),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Row(
              children: [
                IconBadge(i, size: 52),
                const SizedBox(width: Siga.s2),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: const TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        subtitle,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
                Icon(FluentIcons.chevron_right_24_regular, color: palette.ink2),
              ],
            ),
          ),
        );
    void sheet(String title, List<Widget> children) => showSigaSheet<void>(
      context,
      title: title,
      builder: (_) => Column(children: children),
    );
    void pending(String key) => context.go('/more/$key');
    // «10.ª Classe · Turma A» → «Turma · 10.ª Classe» por cima de «Turma A».
    final className = subjects.first['className'] as String;
    final split = className.indexOf(' · ');
    final grade = split > 0 ? className.substring(0, split) : null;
    final group = split > 0 ? className.substring(split + 3) : className;
    void openView(int view) => switch (view) {
      0 => sheet('Disciplinas', [
        for (final item in subjects) subjectCard(item, catalog),
      ]),
      1 => sheet('Professores', [
        if (teachers.isEmpty)
          const EmptyState(message: 'Professores ainda não indicados.'),
        for (final name in teachers)
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: InitialsAvatar(name, size: 40),
            title: Text(name),
          ),
      ]),
      _ => sheet('Aulas de hoje', [
        if (todaySlots.isEmpty)
          const EmptyState(message: 'Sem aulas publicadas para hoje.'),
        for (final slot in todaySlots) slotRow(slot, catalog, day: today),
      ]),
    };
    return [
      Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  grade == null ? 'Turma' : 'Turma · $grade',
                  style: TextStyle(fontSize: 13, color: palette.ink2),
                ),
                const SizedBox(height: 6),
                Semantics(
                  header: true,
                  child: Text(
                    group,
                    style: const TextStyle(
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
            tooltip: 'Outras turmas',
            icon: const Icon(FluentIcons.more_horizontal_24_regular),
            onPressed: () => context.go('/more/classes'),
          ),
        ],
      ),
      const SizedBox(height: Siga.s2),
      Wrap(
        spacing: 10,
        runSpacing: 8,
        children: [
          for (final (i, label) in const [
            'Disciplinas',
            'Professores',
            'Aulas',
          ].indexed)
            ActionChip(
              label: Text(label),
              onPressed: () => openView(i),
              backgroundColor: palette.surface2,
              side: BorderSide.none,
              shape: const StadiumBorder(),
              labelStyle: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w500,
              ),
            ),
        ],
      ),
      const SizedBox(height: Siga.s2),
      const Divider(),
      const SizedBox(height: Siga.s1),
      row(
        FluentIcons.book_open_24_regular,
        'Conteúdos e tarefas',
        'Materiais, actividades e avaliações',
        () => sheet('Conteúdos e tarefas', [
          if (tasks.isEmpty)
            const EmptyState(message: 'Sem actividades publicadas.'),
          for (final task in tasks) taskRow(task, catalog),
        ]),
      ),
      row(
        FluentIcons.chat_24_regular,
        'Grupo WhatsApp',
        'Convite institucional da turma',
        () => pending('whatsapp'),
      ),
      row(
        FluentIcons.video_24_regular,
        'Aulas online',
        'Zoom, Meet ou BigBlueButton',
        () => pending('online'),
      ),
      row(
        FluentIcons.calendar_ltr_24_regular,
        'Horário da turma',
        'Aulas presenciais e virtuais',
        () => sheet('Horário de hoje', [
          if (todaySlots.isEmpty)
            const EmptyState(message: 'Sem aulas publicadas para hoje.'),
          for (final slot in todaySlots) slotRow(slot, catalog, day: today),
        ]),
      ),
      row(
        FluentIcons.clipboard_task_24_regular,
        'Presenças e notas',
        'Conforme o perfil autorizado',
        () => widget.gateway.role == 'aluno'
            ? context.go('/more/results')
            : takeAttendance(subjects),
      ),
    ];
  }

  /// Professor: chamada de hoje numa das disciplinas que lecciona nesta
  /// turma (o servidor confirma a atribuição antes de gravar).
  void takeAttendance(List<Map<String, dynamic>> subjects) {
    final mine = [
      for (final s in subjects)
        if (s['teacher'] is Map &&
            (s['teacher'] as Map)['userId'] == widget.gateway.userId)
          s,
    ];
    void open(Map<String, dynamic> subject) => Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => AttendancePage(
          gateway: widget.gateway,
          classSubjectId: subject['classSubjectId'] as String,
          subjectName: subject['subjectName'] as String,
          className: subject['className'] as String,
          students: [
            for (final st in (subject['students'] as List? ?? []))
              if (st is Map &&
                  st['studentId'] is String &&
                  st['name'] is String)
                (st['studentId'] as String, st['name'] as String),
          ],
        ),
      ),
    );
    if (mine.length == 1) return open(mine.single);
    showSigaSheet<void>(
      context,
      title: 'Fazer chamada',
      builder: (sheet) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (mine.isEmpty)
            const Text(
              'Não tem disciplinas atribuídas nesta turma. As presenças são '
              'lançadas pelo professor da disciplina.',
            ),
          for (final subject in mine)
            MenuRow(
              icon: FluentIcons.clipboard_task_24_regular,
              title: subject['subjectName'] as String,
              onTap: () {
                Navigator.of(sheet).pop();
                open(subject);
              },
            ),
        ],
      ),
    );
  }

  List<Widget> tasksScreen(AcademicCatalog catalog) {
    final all = sortedTasks(
      catalog.tasks.where((t) => matches(t['title'] as String)),
    );
    // Agrupadas por urgência; as de prazo terminado no fim, mais recentes
    // primeiro.
    final groups = <Urgency, List<Map<String, dynamic>>>{};
    for (final task in all) {
      (groups[dueText(task['due']).$2] ??= []).add(task);
    }
    const titles = {
      Urgency.today: 'Hoje',
      Urgency.week: 'Esta semana',
      Urgency.later: 'Mais tarde',
      Urgency.none: 'Sem prazo',
      Urgency.overdue: 'Prazo terminado',
    };
    return [
      searchField('Pesquisar tarefa…', always: true),
      if (all.isEmpty)
        const EmptyState(message: 'Sem tarefas para os filtros escolhidos.'),
      for (final MapEntry(key: urgency, value: title) in titles.entries)
        if (groups[urgency] case final list?) ...[
          SectionHeader('$title (${list.length})'),
          for (final task in urgency == Urgency.overdue ? list.reversed : list)
            taskRow(task, catalog),
        ],
    ];
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<Map<String, dynamic>>(
    future: data,
    builder: (context, snapshot) {
      if (snapshot.connectionState != ConnectionState.done &&
          !snapshot.hasData) {
        return const Center(child: CircularProgressIndicator());
      }
      if (snapshot.hasError) {
        return failure(
          'Não foi possível carregar os dados. Verifique a ligação ou volte a entrar.',
        );
      }
      final result = snapshot.data!;
      final path = widget.path;
      AcademicCatalog? catalog;
      if (path != '/messages') {
        try {
          catalog = AcademicCatalog.parse(result);
        } on FormatException {
          return failure(
            'Os dados recebidos não correspondem ao catálogo institucional.',
          );
        }
      }
      final List<Widget> body = switch (path) {
        '/home' => home(catalog!),
        '/calendar' => calendarScreen(catalog!),
        '/messages' => chatScreen(result),
        '/classes' => classesScreen(catalog!),
        '/class' => classScreen(catalog!),
        '/tasks' => tasksScreen(catalog!),
        _ => subjectsScreen(catalog!),
      };
      final backdrop = AppearanceScope.maybeOf(context)?.backdrop;
      final list = RefreshIndicator(
        onRefresh: () async {
          setState(load);
          // O FutureBuilder mostra o erro; aqui só se evita um Future órfão.
          try {
            await data;
          } catch (_) {
            /* estado de erro visível */
          }
        },
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(Siga.s3, Siga.s2, Siga.s3, 96),
          children: [
            for (final (i, child) in body.indexed)
              Entrance(index: i, child: child),
          ],
        ),
      );
      if (path != '/home' || backdrop == null) return list;
      // Plano de fundo do painel (Aparência): só no topo do início, suave.
      final colors = Siga.backdrops[backdrop % Siga.backdrops.length];
      return Stack(
        children: [
          Positioned(
            left: 0,
            right: 0,
            top: 0,
            height: 260,
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomCenter,
                  colors: [
                    for (final c in colors) c.withValues(alpha: .35),
                    Theme.of(context).colorScheme.surface,
                  ],
                ),
              ),
            ),
          ),
          list,
        ],
      );
    },
  );

  Widget failure(String message) => Center(
    child: Padding(
      padding: const EdgeInsets.all(Siga.s3),
      child: EmptyState(
        icon: FluentIcons.cloud_off_24_regular,
        message: message,
        action: 'Tentar novamente',
        onAction: () => setState(load),
      ),
    ),
  );
}
