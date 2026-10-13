import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'academic.dart';
import 'design/tokens.dart';
import 'design/widgets.dart';
import 'gateway.dart';

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

/// Ecrãs com dados da escola activa: início, disciplinas, calendário,
/// mensagens, turmas, turma e tarefas. Os dados vêm só do gateway (o
/// servidor decide a autorização); aqui decide-se apenas a apresentação.
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

class _DataPageState extends State<DataPage> {
  late Future<Map<String, dynamic>> data;
  Timer? clock;
  String query = '';
  String? classFilter;
  bool unreadOnly = false;
  DateTime selected = luandaClock(DateTime.now());

  @override
  void initState() {
    super.initState();
    load();
    clock = Timer.periodic(const Duration(minutes: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    clock?.cancel();
    super.dispose();
  }

  void load() {
    data = widget.gateway.read(
      widget.path == '/messages' ? 'chat' : 'academic',
    );
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

  // ───────── Folhas de detalhe ─────────

  void subjectDetail(Map<String, dynamic> item, AcademicCatalog catalog) {
    final tasks = sortedTasks(
      catalog.tasks.where((t) => t['classSubjectId'] == item['classSubjectId']),
    );
    final teacher = item['teacher'];
    showSigaSheet<void>(
      context,
      title: '${item['subjectName']}',
      builder: (context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('${item['className']}'),
          if (teacher is Map && teacher['name'] is String)
            Padding(
              padding: const EdgeInsets.only(top: Siga.s1),
              child: Text('Professor: ${teacher['name']}'),
            ),
          const SectionHeader('Actividades'),
          if (tasks.isEmpty)
            const EmptyState(message: 'Sem actividades publicadas.'),
          for (final task in tasks) taskRow(task, catalog, showSubject: false),
        ],
      ),
    );
  }

  void taskDetail(Map<String, dynamic> task) {
    showSigaSheet<void>(
      context,
      title: task['title'] as String,
      builder: (context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: Siga.s1,
            runSpacing: Siga.s1,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              const Icon(Icons.event_outlined, size: 18),
              Text(deadline(task['due'])),
              if (overdue(task)) const StatusTag('Prazo terminado'),
            ],
          ),
          const SizedBox(height: Siga.s2),
          Text(
            task['instructions'] as String? ?? 'Sem instruções adicionais.',
            style: Theme.of(context).textTheme.bodyLarge,
          ),
          const SizedBox(height: Siga.s3),
          const Text(
            'A entrega de trabalhos ainda não está disponível neste cliente.',
          ),
        ],
      ),
    );
  }

  /// Serviço que depende de uma integração ainda por activar: diz o que é e
  /// porque ainda não está disponível, sem simular que funciona.
  void pendingService(String title, String explanation) {
    showSigaSheet<void>(
      context,
      title: title,
      builder: (context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Align(
            alignment: Alignment.centerLeft,
            child: StatusTag('Por activar'),
          ),
          const SizedBox(height: Siga.s2),
          Text(explanation, style: Theme.of(context).textTheme.bodyLarge),
          const SizedBox(height: Siga.s2),
          const Text(
            'Links e credenciais são geridos pelo servidor da escola; esta '
            'aplicação não os guarda nem os inventa.',
          ),
        ],
      ),
    );
  }

  // ───────── Linhas ─────────

  Widget subjectCard(Map<String, dynamic> item, AcademicCatalog catalog) {
    final count = catalog.tasks
        .where((t) => t['classSubjectId'] == item['classSubjectId'])
        .length;
    final tasks = count == 0
        ? 'sem tarefas'
        : count == 1
        ? '1 tarefa'
        : '$count tarefas';
    return Padding(
      padding: const EdgeInsets.only(bottom: Siga.s1),
      child: SigaCard(
        onTap: () => subjectDetail(item, catalog),
        semanticLabel: '${item['subjectName']}, ${item['className']}',
        child: Row(
          children: [
            const IconBadge(Icons.menu_book_outlined, accent: true),
            const SizedBox(width: Siga.s2),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${item['subjectName']}',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${item['className']} · $tasks',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right, size: 20),
          ],
        ),
      ),
    );
  }

  /// Aula no horário: barra de cor à esquerda, disciplina, hora e sala.
  Widget slotRow(Map<String, dynamic> slot, AcademicCatalog catalog) {
    final scheme = Theme.of(context).colorScheme;
    final legacy = slot['publication'] == 'legacy';
    return Padding(
      padding: const EdgeInsets.only(bottom: Siga.s1),
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              width: 4,
              decoration: BoxDecoration(
                color: legacy ? scheme.outline : scheme.primary,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(width: Siga.s2),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      catalog.subject(slot['classSubjectId']),
                      style: Theme.of(context).textTheme.titleMedium,
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
  }) => MenuRow(
    icon: Icons.assignment_outlined,
    title: '${task['title']}',
    subtitle: showSubject
        ? '${catalog.subject(task['classSubjectId'])} · ${deadline(task['due'])}'
        : deadline(task['due']),
    onTap: () => taskDetail(task),
  );

  Widget searchField(String hint) => Padding(
    padding: const EdgeInsets.only(bottom: Siga.s2),
    child: TextField(
      decoration: InputDecoration(
        hintText: hint,
        prefixIcon: const Icon(Icons.search),
      ),
      onChanged: (value) => setState(() {
        query = value.trim().toLowerCase();
      }),
    ),
  );

  Widget chips(List<(String, bool, VoidCallback)> options) =>
      SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.only(bottom: Siga.s2),
        child: Row(
          children: [
            for (final (label, isSelected, onTap) in options)
              Padding(
                padding: const EdgeInsets.only(right: Siga.s1),
                child: ChoiceChip(
                  label: Text(label),
                  selected: isSelected,
                  showCheckmark: false,
                  labelStyle: TextStyle(
                    color: isSelected
                        ? Colors.white
                        : Theme.of(context).colorScheme.onSurface,
                    fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
                  ),
                  onSelected: (_) => setState(onTap),
                ),
              ),
          ],
        ),
      );

  // ───────── Ecrãs ─────────

  List<Widget> home(AcademicCatalog catalog) {
    final now = luandaClock(DateTime.now());
    final next = catalog.upcoming(DateTime.now());
    final isTeacher = widget.gateway.role == 'professor';
    final first = widget.name.trim().split(RegExp(r'\s+')).first;
    final tasks = sortedTasks(catalog.tasks.where((t) => !overdue(t)));
    return [
      Row(
        children: [
          InitialsAvatar(widget.name, size: 52),
          const SizedBox(width: Siga.s2),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Semantics(
                  header: true,
                  child: Text(
                    first.isEmpty ? 'Bem-vindo!' : 'Bem-vindo, $first!',
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                ),
                Text(
                  [
                    isTeacher ? 'Professor' : 'Aluno',
                    ?widget.schoolName,
                  ].join(' · '),
                  style: Theme.of(context).textTheme.bodyMedium,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
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
              const IconBadge(Icons.event_available_outlined),
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
      const SectionHeader('Serviços escolares'),
      ServiceGrid(
        children: [
          ServiceTile(
            icon: Icons.menu_book_outlined,
            label: 'Disciplinas',
            onTap: () => context.go('/subjects'),
          ),
          ServiceTile(
            icon: Icons.groups_outlined,
            label: 'Turmas',
            onTap: () => context.go('/more/classes'),
          ),
          ServiceTile(
            icon: Icons.assignment_turned_in_outlined,
            label: 'Tarefas',
            onTap: () => context.go('/more/tasks'),
          ),
          ServiceTile(
            icon: Icons.directions_bus_outlined,
            label: 'Transporte',
            onTap: () => context.go('/more/transport'),
          ),
          ServiceTile(
            icon: Icons.calendar_month_outlined,
            label: 'Calendário',
            onTap: () => context.go('/calendar'),
          ),
          ServiceTile(
            icon: Icons.chat_bubble_outline,
            label: 'Mensagens',
            onTap: () => context.go('/messages'),
          ),
          ServiceTile(
            icon: Icons.videocam_outlined,
            label: 'Aulas online',
            onTap: () => pendingService(
              'Aulas online',
              'Zoom, Google Meet ou BigBlueButton, configurados pela escola por '
                  'instituição, turma ou aula. A ligação aparece aqui quando a '
                  'escola a activar.',
            ),
          ),
          ServiceTile(
            icon: Icons.palette_outlined,
            label: 'Aparência',
            onTap: () => context.go('/more/appearance'),
          ),
          ServiceTile(
            icon: Icons.apps,
            label: 'Mais',
            onTap: () => context.go('/more'),
          ),
        ],
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
        action: 'Ver todas',
        onAction: () => context.go('/more/tasks'),
      ),
      if (tasks.isEmpty)
        const EmptyState(message: 'Sem actividades por entregar.'),
      for (final task in tasks.take(4)) taskRow(task, catalog),
    ];
  }

  Widget nextLesson(
    Map<String, dynamic> next,
    AcademicCatalog catalog,
    DateTime now,
  ) {
    final scheme = Theme.of(context).colorScheme;
    final running = minutes(next['startsAt'])! <= now.hour * 60 + now.minute;
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
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      running ? 'Aula agora' : 'Próxima aula',
                      style: TextStyle(
                        color: scheme.primary,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      catalog.subject(next['classSubjectId']),
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${hours(next)} · ${next['room'] ?? 'Sala por indicar'}',
                      style: Theme.of(context).textTheme.bodyMedium,
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

  List<Widget> subjectsScreen(AcademicCatalog catalog) {
    final classNames = {
      for (final c in catalog.classes) c['className'] as String,
    }.toList()..sort();
    final subjects = catalog.classes
        .where(
          (c) =>
              (classFilter == null || c['className'] == classFilter) &&
              matches('${c['subjectName']} ${c['className']}'),
        )
        .toList();
    return [
      searchField('Pesquisar disciplina…'),
      if (classNames.length > 1)
        chips([
          ('Todas', classFilter == null, () => classFilter = null),
          for (final name in classNames)
            (name, classFilter == name, () => classFilter = name),
        ]),
      if (subjects.isEmpty)
        const EmptyState(
          message: 'Sem disciplinas para os filtros escolhidos.',
        ),
      for (final item in subjects) subjectCard(item, catalog),
    ];
  }

  List<Widget> calendarScreen(AcademicCatalog catalog) {
    final scheme = Theme.of(context).colorScheme;
    final palette = SigaPalette.of(context);
    final today = luandaClock(DateTime.now());
    final monday = DateTime(
      selected.year,
      selected.month,
      selected.day,
    ).subtract(Duration(days: selected.weekday - 1));
    final week = [for (var i = 0; i < 7; i++) monday.add(Duration(days: i))];
    final slots = catalog
        .forDay(selected)
        .where((s) => matches(catalog.subject(s['classSubjectId'])))
        .toList();
    bool same(DateTime a, DateTime b) =>
        a.year == b.year && a.month == b.month && a.day == b.day;
    final dayLabel = same(selected, today)
        ? 'Hoje'
        : weekdays[selected.weekday - 1];
    return [
      Row(
        children: [
          IconButton(
            tooltip: 'Semana anterior',
            onPressed: () => setState(() {
              selected = selected.subtract(const Duration(days: 7));
            }),
            icon: const Icon(Icons.chevron_left),
          ),
          Expanded(
            child: Center(
              child: Text(
                '${months[selected.month - 1]} ${selected.year}',
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
          ),
          IconButton(
            tooltip: 'Semana seguinte',
            onPressed: () => setState(() {
              selected = selected.add(const Duration(days: 7));
            }),
            icon: const Icon(Icons.chevron_right),
          ),
        ],
      ),
      const SizedBox(height: Siga.s1),
      Row(
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
                            color: same(day, today)
                                ? scheme.primary
                                : palette.ink2,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 6),
                        AnimatedContainer(
                          duration: Siga.motion(context, Siga.quick),
                          width: 38,
                          height: 38,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: same(day, selected)
                                ? scheme.primary
                                : Colors.transparent,
                            borderRadius: BorderRadius.circular(Siga.rSmall),
                          ),
                          child: Text(
                            '${day.day}',
                            style: TextStyle(
                              fontWeight: FontWeight.w600,
                              color: same(day, selected)
                                  ? Colors.white
                                  : scheme.onSurface,
                            ),
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
      Padding(
        padding: const EdgeInsets.only(top: Siga.s3, bottom: Siga.s2),
        child: Row(
          children: [
            Expanded(
              child: Text(
                '$dayLabel · ${selected.day} de ${months[selected.month - 1]}',
                style: Theme.of(context).textTheme.titleMedium,
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
      for (final slot in slots) slotRow(slot, catalog),
      const SizedBox(height: Siga.s2),
      Text(
        'Horário previsto. Presenças e cancelamentos aparecem depois de '
        'integrados os respectivos registos.',
        style: Theme.of(context).textTheme.bodySmall,
      ),
    ];
  }

  List<Widget> chatScreen(Map<String, dynamic> result) {
    if (result['threads'] is! List) {
      return const [
        EmptyState(
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
    final shown = threads
        .where(
          (t) => matches(t['name'] as String) && (!unreadOnly || unread(t) > 0),
        )
        .toList();
    final scheme = Theme.of(context).colorScheme;
    String pending(int count) => count == 0
        ? 'Sem mensagens por ler'
        : count == 1
        ? '1 mensagem por ler'
        : '$count mensagens por ler';
    return [
      searchField('Pesquisar conversas…'),
      chips([
        ('Todas', !unreadOnly, () => unreadOnly = false),
        ('Não lidas', unreadOnly, () => unreadOnly = true),
      ]),
      if (threads.isEmpty)
        const EmptyState(message: 'Sem conversas nesta escola.')
      else if (shown.isEmpty)
        const EmptyState(message: 'Sem conversas para os filtros escolhidos.'),
      for (final thread in shown)
        ListTile(
          contentPadding: const EdgeInsets.symmetric(vertical: 4),
          leading: InitialsAvatar(thread['name'] as String, size: 46),
          title: Text(
            thread['name'] as String,
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
          subtitle: Text(pending(unread(thread))),
          trailing: unread(thread) == 0
              ? null
              : Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 3,
                  ),
                  decoration: BoxDecoration(
                    color: scheme.primary,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    '${unread(thread)}',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
        ),
      const SizedBox(height: Siga.s2),
      Text(
        'O histórico e o envio de mensagens estão em integração.',
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
      searchField('Pesquisar turma…'),
      if (groups.isEmpty)
        const EmptyState(
          message: 'Sem turmas autorizadas para os filtros escolhidos.',
        ),
      for (final group in groups.entries)
        Padding(
          padding: const EdgeInsets.only(bottom: Siga.s1),
          child: SigaCard(
            onTap: () =>
                context.go('/more/classes/${Uri.encodeComponent(group.key)}'),
            child: Row(
              children: [
                const IconBadge(Icons.groups_outlined, accent: true),
                const SizedBox(width: Siga.s2),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        group.value.first['className'] as String,
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      Text(
                        group.value.length == 1
                            ? '1 disciplina'
                            : '${group.value.length} disciplinas',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right, size: 20),
              ],
            ),
          ),
        ),
    ];
  }

  /// Espaço da turma, organizado como no Moodle: conteúdos, comunicação,
  /// aulas, horário e avaliação, cada um com o seu destino.
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
    String plural(int n, String one, String many) =>
        n == 1 ? '1 $one' : '$n $many';
    return [
      Text(
        'Turma',
        style: TextStyle(color: palette.ink2, fontWeight: FontWeight.w600),
      ),
      const SizedBox(height: 4),
      Semantics(
        header: true,
        child: Text(
          subjects.first['className'] as String,
          style: Theme.of(context).textTheme.headlineSmall,
        ),
      ),
      const SizedBox(height: Siga.s2),
      Wrap(
        spacing: Siga.s1,
        runSpacing: Siga.s1,
        children: [
          StatusTag(plural(subjects.length, 'disciplina', 'disciplinas')),
          if (teachers.isNotEmpty)
            StatusTag(plural(teachers.length, 'professor', 'professores')),
          StatusTag(plural(todaySlots.length, 'aula hoje', 'aulas hoje')),
        ],
      ),
      const SizedBox(height: Siga.s2),
      const Divider(),
      MenuRow(
        icon: Icons.menu_book_outlined,
        title: 'Conteúdos e tarefas',
        subtitle: tasks.isEmpty
            ? 'Sem actividades publicadas'
            : plural(
                tasks.length,
                'actividade publicada',
                'actividades publicadas',
              ),
        onTap: () => showSigaSheet<void>(
          context,
          title: 'Conteúdos e tarefas',
          builder: (context) => Column(
            children: [
              if (tasks.isEmpty)
                const EmptyState(message: 'Sem actividades publicadas.'),
              for (final task in tasks) taskRow(task, catalog),
            ],
          ),
        ),
      ),
      MenuRow(
        icon: Icons.forum_outlined,
        title: 'Grupo WhatsApp',
        subtitle: 'Convite institucional da turma',
        trailing: const StatusTag('Por activar'),
        onTap: () => pendingService(
          'Grupo WhatsApp',
          'A escola partilha aqui o link de convite do grupo da turma. A API '
              'oficial do WhatsApp não permite criar nem gerir grupos '
              'automaticamente, por isso o convite é registado pela escola.',
        ),
      ),
      MenuRow(
        icon: Icons.videocam_outlined,
        title: 'Aulas online',
        subtitle: 'Zoom, Meet ou BigBlueButton',
        trailing: const StatusTag('Por activar'),
        onTap: () => pendingService(
          'Aulas online',
          'A plataforma de videoconferência é configurada pela escola, por '
              'instituição, turma ou aula.',
        ),
      ),
      MenuRow(
        icon: Icons.calendar_month_outlined,
        title: 'Horário da turma',
        subtitle: todaySlots.isEmpty
            ? 'Sem aulas hoje'
            : 'Hoje: ${plural(todaySlots.length, 'aula', 'aulas')}',
        onTap: () => showSigaSheet<void>(
          context,
          title: 'Horário de hoje',
          builder: (context) => Column(
            children: [
              if (todaySlots.isEmpty)
                const EmptyState(message: 'Sem aulas publicadas para hoje.'),
              for (final slot in todaySlots) slotRow(slot, catalog),
            ],
          ),
        ),
      ),
      MenuRow(
        icon: Icons.fact_check_outlined,
        title: 'Presenças e notas',
        subtitle: 'Conforme o perfil autorizado',
        trailing: const StatusTag('Por activar'),
        onTap: () => pendingService(
          'Presenças e notas',
          'As presenças e as notas publicadas aparecem aqui, só para quem '
              'tem permissão, quando os respectivos contratos estiverem '
              'ligados.',
        ),
      ),
      const SectionHeader('Disciplinas'),
      for (final item in subjects) subjectCard(item, catalog),
    ];
  }

  List<Widget> tasksScreen(AcademicCatalog catalog) {
    final all = sortedTasks(
      catalog.tasks.where((t) => matches(t['title'] as String)),
    );
    final open = all.where((t) => !overdue(t)).toList();
    final closed = all.where(overdue).toList();
    return [
      searchField('Pesquisar tarefa…'),
      if (all.isEmpty)
        const EmptyState(message: 'Sem tarefas para os filtros escolhidos.'),
      if (open.isNotEmpty) const SectionHeader('Por entregar'),
      for (final task in open) taskRow(task, catalog),
      if (closed.isNotEmpty) const SectionHeader('Prazo terminado'),
      for (final task in closed) taskRow(task, catalog),
    ];
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<Map<String, dynamic>>(
    future: data,
    builder: (context, snapshot) {
      if (snapshot.connectionState != ConnectionState.done) {
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
      final title = switch (path) {
        '/calendar' => 'Calendário',
        '/messages' => 'Mensagens',
        '/subjects' => 'Disciplinas',
        _ => null,
      };
      final List<Widget> body = switch (path) {
        '/home' => home(catalog!),
        '/calendar' => calendarScreen(catalog!),
        '/messages' => chatScreen(result),
        '/classes' => classesScreen(catalog!),
        '/class' => classScreen(catalog!),
        '/tasks' => tasksScreen(catalog!),
        _ => subjectsScreen(catalog!),
      };
      return RefreshIndicator(
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
          padding: const EdgeInsets.fromLTRB(Siga.s3, Siga.s2, Siga.s3, 120),
          children: [
            if (title != null) ...[
              Semantics(
                header: true,
                child: Text(
                  title,
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
              ),
              const SizedBox(height: Siga.s2),
            ],
            ...body,
          ],
        ),
      );
    },
  );

  Widget failure(String message) => Center(
    child: Padding(
      padding: const EdgeInsets.all(Siga.s3),
      child: EmptyState(
        icon: Icons.cloud_off_outlined,
        message: message,
        action: 'Tentar novamente',
        onAction: () => setState(load),
      ),
    ),
  );
}
