import 'dart:async';
import 'package:flutter/material.dart';
import 'academic.dart';
import 'design.dart';
import 'gateway.dart';
import 'records.dart';
import 'services_page.dart';

const _weekdays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const _weekdaysLong = [
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
  'Domingo',
];
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
String _two(int value) => value.toString().padLeft(2, '0');
String _hhmm(dynamic time) =>
    time is String && time.length >= 5 ? time.substring(0, 5) : '--:--';

/// Every institutional data screen: the shell gives the path, this page reads
/// the authorized collection and renders it with the approved layout.
class DataPage extends StatefulWidget {
  const DataPage({
    super.key,
    required this.gateway,
    required this.path,
    required this.name,
    this.groupId,
    this.modernIcons = true,
    this.onOpen,
    this.onPreview,
  });
  final MobileGateway gateway;
  final String path;
  final String name;
  final String? groupId;
  final bool modernIcons;
  final void Function(String route)? onOpen;
  final void Function(SchoolService service)? onPreview;
  @override
  State<DataPage> createState() => _DataPageState();
}

class _DataPageState extends State<DataPage> {
  late Future<Map<String, dynamic>> data;
  Timer? clock;
  String query = '';
  int filter = 0;
  int calendarTab = 0;
  String? term;
  DateTime selected = luandaClock(DateTime.now());
  NoticeFeed? feed;
  bool paging = false;

  String get collection => switch (widget.path) {
    '/messages' => 'chat',
    '/results' => 'results',
    '/notices' => 'notices',
    _ => 'academic',
  };

  void load() {
    feed = null;
    paging = false;
    data = widget.gateway.read(collection);
  }

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

  Future<void> more(NoticeFeed current) async {
    final cursor = current.nextCursor;
    if (paging || cursor == null) return;
    setState(() {
      paging = true;
    });
    try {
      final page = await widget.gateway.read('notices', cursor: cursor);
      if (!mounted) return;
      final parsed = NoticeFeed.parse(
        page,
        DateTime.now().toUtc(),
        cursor: cursor,
      );
      setState(() {
        feed = current.merge(parsed);
      });
    } catch (_) {
      if (mounted) {
        // A failed page never silently truncates the feed.
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Não foi possível carregar mais avisos.'),
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          paging = false;
        });
      }
    }
  }

  bool matches(String value) => value.toLowerCase().contains(query);
  SigaPalette get palette => Sg.of(context);

  @override
  Widget build(BuildContext context) => FutureBuilder<Map<String, dynamic>>(
    future: data,
    builder: (context, snapshot) {
      if (snapshot.connectionState != ConnectionState.done) {
        return const Center(child: CircularProgressIndicator(strokeWidth: 2.5));
      }
      if (snapshot.hasError) {
        return StateMessage(
          icon: Icons.cloud_off_outlined,
          message:
              'Não foi possível carregar os dados. Verifique a ligação ou volte a entrar.',
          action: 'Tentar novamente',
          onAction: () => setState(load),
        );
      }
      final result = snapshot.data!;
      AcademicCatalog? catalog;
      if (collection == 'academic') {
        try {
          catalog = AcademicCatalog.parse(result);
        } on FormatException {
          return StateMessage(
            icon: Icons.rule_folder_outlined,
            message:
                'Os dados recebidos não correspondem ao catálogo institucional.',
            action: 'Tentar novamente',
            onAction: () => setState(load),
          );
        }
      }
      return RefreshIndicator(
        onRefresh: () async {
          setState(load);
          // FutureBuilder displays request errors without leaking an unhandled refresh Future.
          try {
            await data;
          } catch (_) {
            /* visible error state */
          }
        },
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(
            Sg.gutter,
            Sg.gapS,
            Sg.gutter,
            Sg.gapXl,
          ),
          children: switch (widget.path) {
            '/home' => home(catalog!),
            '/subjects' => subjects(catalog!),
            '/calendar' => calendar(catalog!),
            '/messages' => messages(result),
            '/classes' => classes(catalog!),
            '/class' => classSpace(catalog!),
            '/tasks' => tasks(catalog!),
            '/results' => results(result),
            '/notices' => notices(result),
            _ => [const SizedBox.shrink()],
          },
        ),
      );
    },
  );

  // ---------------------------------------------------------------- building
  Widget pageTitle(String title, {String? subtitle, Widget? action}) => Padding(
    padding: const EdgeInsets.only(bottom: Sg.gapM, top: Sg.gapS),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: Sg.title.copyWith(color: palette.text)),
              if (subtitle != null) ...[
                const SizedBox(height: Sg.gapXs),
                Text(
                  subtitle,
                  style: Sg.caption.copyWith(color: palette.muted),
                ),
              ],
            ],
          ),
        ),
        ?action,
      ],
    ),
  );

  Widget subjectRow(Map<String, dynamic> item, AcademicCatalog catalog) {
    final count = catalog.tasks
        .where((t) => t['classSubjectId'] == item['classSubjectId'])
        .length;
    return SigaRow(
      leading: IconTile(
        widget.modernIcons ? Icons.menu_book_rounded : Icons.menu_book_outlined,
        seed: item['subjectName'],
      ),
      title: '${item['subjectName']}',
      subtitle:
          '${item['className']}${count == 0 ? '' : ' · $count ${count == 1 ? 'tarefa' : 'tarefas'}'}',
      onTap: () => subjectSheet(item, catalog),
    );
  }

  Widget slotRow(Map<String, dynamic> slot, AcademicCatalog catalog) {
    final subject = catalog.subject(slot['classSubjectId']);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 3,
            height: 46,
            margin: const EdgeInsets.only(right: Sg.gap, top: 2),
            decoration: BoxDecoration(
              color: Sg.accent(subject),
              borderRadius: BorderRadius.circular(Sg.rPill),
            ),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  subject,
                  style: Sg.itemTitle.copyWith(color: palette.text),
                ),
                const SizedBox(height: 2),
                Text(
                  '${_hhmm(slot['startsAt'])} – ${_hhmm(slot['endsAt'])} · ${slot['room'] ?? 'Sala por indicar'}',
                  style: Sg.caption.copyWith(color: palette.muted),
                ),
                if (slot['publication'] == 'legacy')
                  Text(
                    'Horário legado: confirme com a escola',
                    style: Sg.caption.copyWith(color: Sg.accent('aviso')),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget taskRow(Map<String, dynamic> task, AcademicCatalog catalog) => SigaRow(
    leading: IconTile(
      widget.modernIcons ? Icons.assignment_rounded : Icons.assignment_outlined,
      seed: catalog.subject(task['classSubjectId']),
    ),
    title: '${task['title']}',
    subtitle:
        '${catalog.subject(task['classSubjectId'])} · ${deadline(task['due'])}',
    onTap: () => taskSheet(task, catalog),
  );

  String deadline(dynamic due) {
    if (due == null) return 'Sem prazo indicado';
    final local = luandaClock(DateTime.parse(due as String));
    return '${local.day} de ${_months[local.month - 1]} · ${_two(local.hour)}:${_two(local.minute)}';
  }

  // -------------------------------------------------------------------- home
  List<Widget> home(AcademicCatalog catalog) {
    final now = luandaClock(DateTime.now());
    final next = catalog.upcoming(DateTime.now());
    final running =
        next != null &&
        minutes(next['startsAt'])! <= now.hour * 60 + now.minute;
    final first = widget.name.trim().split(RegExp(r'\s+')).first;
    final upcoming = catalog.tasks.toList()
      ..sort(
        (a, b) => (a['due'] as String? ?? '9999').compareTo(
          b['due'] as String? ?? '9999',
        ),
      );
    return [
      Padding(
        padding: const EdgeInsets.symmetric(vertical: Sg.gapS),
        child: Row(
          children: [
            InitialsAvatar(widget.name, size: 48, gradient: true),
            const SizedBox(width: Sg.gap),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Bem-vindo, ${first.isEmpty ? 'de volta' : first}!',
                    style: Sg.title.copyWith(fontSize: 23, color: palette.text),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    widget.gateway.role == 'professor' ? 'Professor' : 'Aluno',
                    style: Sg.caption.copyWith(color: palette.muted),
                  ),
                ],
              ),
            ),
            IconButton(
              tooltip: 'Avisos',
              onPressed: () => widget.onOpen?.call('/more/notices'),
              icon: Icon(Icons.notifications_none_rounded, color: palette.text),
            ),
          ],
        ),
      ),
      const SizedBox(height: Sg.gapS),
      if (next != null)
        SigaCard(
          padding: const EdgeInsets.fromLTRB(
            Sg.gapM,
            Sg.gapM,
            Sg.gapM,
            Sg.gapM,
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 4,
                height: 54,
                margin: const EdgeInsets.only(right: Sg.gapM),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.primary,
                  borderRadius: BorderRadius.circular(Sg.rPill),
                ),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      running
                          ? 'Aula prevista em curso'
                          : 'Próxima aula prevista',
                      style: Sg.tiny.copyWith(
                        color: Theme.of(context).colorScheme.primary,
                      ),
                    ),
                    const SizedBox(height: Sg.gapXs),
                    Text(
                      catalog.subject(next['classSubjectId']),
                      style: Sg.section.copyWith(
                        fontSize: 18,
                        color: palette.text,
                      ),
                    ),
                    const SizedBox(height: Sg.gapXs),
                    Text(
                      '${_hhmm(next['startsAt'])} – ${_hhmm(next['endsAt'])} · ${next['room'] ?? 'Sala por indicar'}',
                      style: Sg.caption.copyWith(color: palette.muted),
                    ),
                  ],
                ),
              ),
            ],
          ),
        )
      else
        SigaCard(
          color: palette.surface,
          child: Row(
            children: [
              IconTile(
                Icons.event_available_outlined,
                color: palette.muted,
                size: 40,
              ),
              const SizedBox(width: Sg.gap),
              Expanded(
                child: Text(
                  'Sem mais aulas publicadas para hoje.',
                  style: Sg.caption.copyWith(color: palette.muted),
                ),
              ),
            ],
          ),
        ),
      SectionHeader(
        'Disciplinas',
        action: 'Ver todas',
        onAction: () => widget.onOpen?.call('/subjects'),
      ),
      if (catalog.classes.isEmpty)
        emptyLine('Sem disciplinas neste vínculo.')
      else
        for (final item in catalog.classes.take(3)) subjectRow(item, catalog),
      SectionHeader(
        'Próximas actividades',
        action: 'Ver todas',
        onAction: () => widget.onOpen?.call('/more/tasks'),
      ),
      if (upcoming.isEmpty)
        emptyLine('Sem actividades publicadas.')
      else
        for (final task in upcoming.take(4)) taskRow(task, catalog),
      const Footnote(
        'Horário previsto pela escola. Presenças, cancelamentos e entregas não são inferidos aqui.',
      ),
    ];
  }

  Widget emptyLine(String text) => Padding(
    padding: const EdgeInsets.symmetric(vertical: Sg.gapM, horizontal: Sg.gapS),
    child: Text(text, style: Sg.caption.copyWith(color: palette.muted)),
  );

  // ---------------------------------------------------------------- subjects
  List<Widget> subjects(AcademicCatalog catalog) {
    final withTasks = {for (final t in catalog.tasks) t['classSubjectId']};
    final visible = catalog.classes.where((c) {
      if (!matches('${c['subjectName']} ${c['className']}')) return false;
      if (filter == 1) return withTasks.contains(c['classSubjectId']);
      if (filter == 2) return !withTasks.contains(c['classSubjectId']);
      return true;
    }).toList();
    return [
      pageTitle(
        'Disciplinas',
        subtitle: '${catalog.classes.length} no seu vínculo activo',
      ),
      SearchField(
        hint: 'Pesquisar disciplina…',
        onChanged: (v) => setState(() => query = v.trim().toLowerCase()),
      ),
      const SizedBox(height: Sg.gapM),
      FilterChips(
        labels: const ['Todas', 'Com tarefas', 'Sem tarefas'],
        index: filter,
        onSelected: (i) => setState(() => filter = i),
      ),
      const SizedBox(height: Sg.gapS),
      if (visible.isEmpty)
        emptyLine('Sem disciplinas para os filtros escolhidos.'),
      for (final item in visible) subjectRow(item, catalog),
    ];
  }

  // ---------------------------------------------------------------- calendar
  List<Widget> calendar(AcademicCatalog catalog) {
    final today = luandaClock(DateTime.now());
    final start = selected.subtract(Duration(days: selected.weekday - 1));
    final slots = catalog
        .forDay(selected)
        .where((s) => matches(catalog.subject(s['classSubjectId'])))
        .toList();
    return [
      pageTitle('Calendário'),
      FilterChips(
        labels: const ['Agenda', 'Horários'],
        index: calendarTab,
        onSelected: (i) => setState(() => calendarTab = i),
      ),
      const SizedBox(height: Sg.gapM),
      if (calendarTab == 0) ...[
        Row(
          children: [
            for (var i = 0; i < 5; i++)
              Expanded(child: dayPill(start.add(Duration(days: i)), today)),
          ],
        ),
        const SizedBox(height: Sg.gapL),
        Row(
          children: [
            Expanded(
              child: Text(
                '${sameDay(selected, today) ? 'Hoje' : _weekdaysLong[selected.weekday - 1]} · '
                '${selected.day} de ${_months[selected.month - 1]}',
                style: Sg.section.copyWith(color: palette.text),
              ),
            ),
            if (!sameDay(selected, today))
              TextButton(
                onPressed: () =>
                    setState(() => selected = luandaClock(DateTime.now())),
                child: const Text('Hoje'),
              ),
          ],
        ),
        const SizedBox(height: Sg.gapS),
        if (slots.isEmpty) emptyLine('Sem aulas publicadas neste dia.'),
        for (final slot in slots) slotRow(slot, catalog),
      ] else ...[
        for (var weekday = 1; weekday <= 6; weekday++) ...[
          Padding(
            padding: const EdgeInsets.only(top: Sg.gapM, bottom: Sg.gapS),
            child: Text(
              _weekdaysLong[weekday - 1],
              style: Sg.section.copyWith(color: palette.text),
            ),
          ),
          if (catalog.slots.where((s) => s['weekday'] == weekday).isEmpty)
            emptyLine('Sem aulas publicadas.')
          else
            for (final slot
                in catalog.slots.where((s) => s['weekday'] == weekday).toList()
                  ..sort(
                    (a, b) => minutes(
                      a['startsAt'],
                    )!.compareTo(minutes(b['startsAt'])!),
                  ))
              slotRow(slot, catalog),
        ],
      ],
      const Footnote(
        'Um horário publicado não prova presença nem substitui a chamada da escola.',
      ),
    ];
  }

  bool sameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  Widget dayPill(DateTime day, DateTime today) {
    final isSelected = sameDay(day, selected);
    final primary = Theme.of(context).colorScheme.primary;
    return InkWell(
      onTap: () => setState(() => selected = day),
      borderRadius: BorderRadius.circular(Sg.rTile),
      child: Column(
        children: [
          Text(
            _weekdays[day.weekday - 1],
            style: Sg.caption.copyWith(color: palette.muted),
          ),
          const SizedBox(height: Sg.gapS),
          Container(
            width: 38,
            height: 38,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: isSelected ? primary : Colors.transparent,
              shape: BoxShape.circle,
              border: Border.all(
                color: !isSelected && sameDay(day, today)
                    ? primary
                    : Colors.transparent,
              ),
            ),
            child: Text(
              '${day.day}',
              style: Sg.itemTitle.copyWith(
                color: isSelected ? Colors.white : palette.text,
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ---------------------------------------------------------------- messages
  List<Widget> messages(Map<String, dynamic> result) {
    final threads = result['threads'];
    if (threads is! List) {
      return [
        pageTitle('Mensagens'),
        StateMessage(
          icon: Icons.forum_outlined,
          message: 'Não foi possível interpretar a lista de conversas.',
          action: 'Tentar novamente',
          onAction: () => setState(load),
        ),
      ];
    }
    final visible = threads
        .whereType<Map>()
        .where((t) => t['name'] is String && matches(t['name'] as String))
        .where(
          (t) =>
              filter == 0 || (t['unread'] is num && (t['unread'] as num) > 0),
        )
        .toList();
    final unread = threads
        .whereType<Map>()
        .where((t) => t['unread'] is num && (t['unread'] as num) > 0)
        .length;
    return [
      pageTitle('Mensagens'),
      SearchField(
        hint: 'Pesquisar conversas…',
        onChanged: (v) => setState(() => query = v.trim().toLowerCase()),
      ),
      const SizedBox(height: Sg.gapM),
      FilterChips(
        labels: const ['Todas', 'Não lidas'],
        index: filter,
        onSelected: (i) => setState(() => filter = i),
        badges: unread == 0 ? const {} : {1: unread},
      ),
      const SizedBox(height: Sg.gapS),
      if (visible.isEmpty)
        emptyLine('Sem conversas para os filtros escolhidos.'),
      for (final thread in visible)
        SigaRow(
          leading: InitialsAvatar('${thread['name']}'),
          title: '${thread['name']}',
          subtitle: '${thread['unread']} não lidas',
          chevron: false,
          onTap: () => widget.onPreview?.call(
            const SchoolService(
              'Mensagens',
              Icons.chat_outlined,
              Icons.chat_rounded,
              detail:
                  'O histórico, os anexos e o envio dependem das capacidades de chat instaladas na escola '
                  'e de Realtime autorizado. Até lá a lista mostra apenas as conversas e o que está por ler.',
            ),
          ),
        ),
      const Footnote('O histórico e o envio de mensagens estão em integração.'),
    ];
  }

  // ----------------------------------------------------------------- classes
  List<Widget> classes(AcademicCatalog catalog) {
    final groups = <String, List<Map<String, dynamic>>>{};
    for (final item in catalog.classes) {
      final id = item['classGroupId'];
      if (id is String && matches('${item['className']}')) {
        (groups[id] ??= []).add(item);
      }
    }
    return [
      pageTitle('Turmas', subtitle: '${groups.length} turma(s) autorizada(s)'),
      SearchField(
        hint: 'Pesquisar turma…',
        onChanged: (v) => setState(() => query = v.trim().toLowerCase()),
      ),
      const SizedBox(height: Sg.gapS),
      if (groups.isEmpty)
        emptyLine('Sem turmas autorizadas para os filtros escolhidos.'),
      for (final group in groups.entries)
        SigaRow(
          leading: IconTile(
            widget.modernIcons ? Icons.groups_rounded : Icons.groups_outlined,
            seed: group.value.first['className'],
          ),
          title: '${group.value.first['className']}',
          subtitle: '${group.value.length} disciplinas',
          onTap: () => widget.onOpen?.call(
            '/more/classes/${Uri.encodeComponent(group.key)}',
          ),
        ),
    ];
  }

  // -------------------------------------------------------------- class space
  List<Widget> classSpace(AcademicCatalog catalog) {
    final subjectsOfClass = catalog.classes
        .where((c) => c['classGroupId'] == widget.groupId)
        .toList();
    if (subjectsOfClass.isEmpty) {
      return [
        pageTitle('Espaço da turma'),
        StateMessage(
          icon: Icons.lock_outline,
          message: 'Esta turma não está disponível no seu contexto actual.',
        ),
      ];
    }
    final ids = subjectsOfClass.map((c) => c['classSubjectId']).toSet();
    final classTasks = catalog.tasks
        .where((t) => ids.contains(t['classSubjectId']))
        .toList();
    final todaySlots = catalog
        .forDay(luandaClock(DateTime.now()))
        .where((s) => ids.contains(s['classSubjectId']))
        .toList();
    final name = '${subjectsOfClass.first['className']}';
    return [
      Padding(
        padding: const EdgeInsets.symmetric(vertical: Sg.gapS),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Turma · $name',
              style: Sg.caption.copyWith(color: palette.muted),
            ),
            const SizedBox(height: Sg.gapXs),
            Text(name, style: Sg.title.copyWith(color: palette.text)),
          ],
        ),
      ),
      const SizedBox(height: Sg.gapS),
      FilterChips(
        labels: const ['Disciplinas', 'Horário', 'Tarefas'],
        index: filter,
        onSelected: (i) => setState(() => filter = i),
      ),
      const SizedBox(height: Sg.gapM),
      if (filter == 0) ...[
        for (final item in subjectsOfClass) subjectRow(item, catalog),
      ] else if (filter == 1) ...[
        if (todaySlots.isEmpty)
          emptyLine('Sem aulas publicadas para hoje nesta turma.'),
        for (final slot in todaySlots) slotRow(slot, catalog),
      ] else ...[
        if (classTasks.isEmpty)
          emptyLine('Sem actividades publicadas nesta turma.'),
        for (final task in classTasks) taskRow(task, catalog),
      ],
      SectionHeader('Serviços da turma'),
      for (final service in [
        schoolServices.firstWhere((s) => s.label == 'WhatsApp'),
        schoolServices.firstWhere((s) => s.label == 'Aulas online'),
        schoolServices.firstWhere((s) => s.label == 'Faltas'),
      ])
        SigaRow(
          leading: IconTile(
            service.icon(widget.modernIcons),
            seed: service.label,
          ),
          title: service.label == 'WhatsApp'
              ? 'Grupo WhatsApp'
              : service.label == 'Faltas'
              ? 'Presenças e notas'
              : service.label,
          subtitle: 'Em preparação',
          onTap: () => widget.onPreview?.call(service),
        ),
      const Footnote(
        'Participantes e colegas não são apresentados: a lista de uma turma exige avaliação de '
        'privacidade por perfil, que não é deduzida das permissões académicas.',
      ),
    ];
  }

  // ------------------------------------------------------------------- tasks
  List<Widget> tasks(AcademicCatalog catalog) {
    final visible =
        catalog.tasks.where((t) => matches('${t['title']}')).toList()..sort(
          (a, b) => (a['due'] as String? ?? '9999').compareTo(
            b['due'] as String? ?? '9999',
          ),
        );
    return [
      pageTitle(
        'Tarefas',
        subtitle: '${catalog.tasks.length} publicada(s) no seu vínculo',
      ),
      SearchField(
        hint: 'Pesquisar tarefa…',
        onChanged: (v) => setState(() => query = v.trim().toLowerCase()),
      ),
      const SizedBox(height: Sg.gapS),
      if (visible.isEmpty) emptyLine('Sem tarefas para os filtros escolhidos.'),
      for (final task in visible) taskRow(task, catalog),
      const Footnote(
        'A entrega de trabalhos ainda não está disponível neste cliente.',
      ),
    ];
  }

  // ----------------------------------------------------------------- results
  List<Widget> results(Map<String, dynamic> result) {
    GradeReport report;
    try {
      report = GradeReport.parse(result);
    } on FormatException catch (error) {
      return [
        pageTitle('Notas'),
        StateMessage(icon: Icons.rule_outlined, message: error.message),
      ];
    }
    if (report.items.isEmpty) {
      return [
        pageTitle('Notas'),
        const StateMessage(
          icon: Icons.workspace_premium_outlined,
          message: 'Sem avaliações publicadas neste vínculo.',
        ),
      ];
    }
    final terms = report.terms;
    final chosen = terms.contains(term) ? term! : terms.first;
    final visible = report
        .forTerm(chosen)
        .where((i) => matches('${i['subjectName']}'))
        .toList();
    return [
      pageTitle(
        'Notas',
        subtitle: 'Publicadas pela escola, na escala comunicada',
      ),
      if (terms.length > 1)
        FilterChips(
          labels: terms,
          index: terms.indexOf(chosen),
          onSelected: (i) => setState(() => term = terms[i]),
        ),
      const SizedBox(height: Sg.gapM),
      if (visible.isEmpty)
        emptyLine('Sem avaliações para os filtros escolhidos.'),
      for (final item in visible)
        Padding(
          padding: const EdgeInsets.only(bottom: Sg.gap),
          child: SigaCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    IconTile(
                      widget.modernIcons
                          ? Icons.workspace_premium_rounded
                          : Icons.workspace_premium_outlined,
                      seed: item['subjectName'],
                      size: 40,
                    ),
                    const SizedBox(width: Sg.gap),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${item['subjectName']}',
                            style: Sg.itemTitle.copyWith(color: palette.text),
                          ),
                          if (item['status'] is String)
                            Text(
                              '${item['status']}',
                              style: Sg.caption.copyWith(color: palette.muted),
                            ),
                        ],
                      ),
                    ),
                    Text(
                      GradeReport.mark(item['finalGrade'], item['scaleMax']),
                      style: Sg.section.copyWith(
                        fontSize: 19,
                        color: palette.text,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: Sg.gapM),
                Wrap(
                  spacing: Sg.gapM,
                  runSpacing: Sg.gapS,
                  children: [
                    for (final grade in item['grades'] as List)
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: Sg.gap,
                          vertical: 6,
                        ),
                        decoration: BoxDecoration(
                          color: palette.surface,
                          borderRadius: BorderRadius.circular(Sg.rPill),
                        ),
                        child: Text(
                          '${grade['label']} · ${GradeReport.mark(grade['value'], item['scaleMax'])}',
                          style: Sg.caption.copyWith(color: palette.text),
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ),
      const Footnote(
        'Médias, exames e recursos seguem as regras da escola e não são calculados neste cliente.',
      ),
    ];
  }

  // ----------------------------------------------------------------- notices
  List<Widget> notices(Map<String, dynamic> result) {
    NoticeFeed current;
    try {
      current = feed ?? NoticeFeed.parse(result, DateTime.now().toUtc());
    } on FormatException catch (error) {
      return [
        pageTitle('Avisos'),
        StateMessage(icon: Icons.campaign_outlined, message: error.message),
      ];
    }
    final visible = current
        .ordered()
        .where((n) => matches('${n['title']} ${n['body']}'))
        .toList();
    return [
      pageTitle('Avisos'),
      SearchField(
        hint: 'Pesquisar aviso…',
        onChanged: (v) => setState(() => query = v.trim().toLowerCase()),
      ),
      const SizedBox(height: Sg.gapS),
      if (visible.isEmpty) emptyLine('Sem avisos para os filtros escolhidos.'),
      for (final item in visible)
        SigaRow(
          leading: IconTile(
            item['pinned'] == true
                ? Icons.push_pin_outlined
                : widget.modernIcons
                ? Icons.campaign_rounded
                : Icons.campaign_outlined,
            seed: item['subjectName'] ?? 'escola',
          ),
          title: '${item['title']}',
          subtitle:
              '${item['subjectName'] ?? (item['audience'] == 'school' ? 'Toda a escola' : 'Turma')}'
              ' · ${deadline(item['publishedAt'])}',
          onTap: () => noticeSheet(item),
        ),
      if (current.nextCursor != null)
        Padding(
          padding: const EdgeInsets.only(top: Sg.gapM),
          child: FilledButton.tonal(
            onPressed: paging ? null : () => more(current),
            child: Text(paging ? 'A carregar…' : 'Ver avisos anteriores'),
          ),
        ),
      const Footnote(
        'A escola decide quem recebe cada aviso. A marcação como lido e os anexos ainda não estão '
        'disponíveis neste cliente.',
      ),
    ];
  }

  // ------------------------------------------------------------------ sheets
  Future<void> sheet(List<Widget> children) => showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (context) => SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * .75,
        ),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(Sg.gutter, 0, Sg.gutter, Sg.gapL),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: children,
          ),
        ),
      ),
    ),
  );

  void subjectSheet(Map<String, dynamic> item, AcademicCatalog catalog) {
    final subjectTasks = catalog.tasks
        .where((t) => t['classSubjectId'] == item['classSubjectId'])
        .toList();
    final subjectSlots =
        catalog.slots
            .where((s) => s['classSubjectId'] == item['classSubjectId'])
            .toList()
          ..sort(
            (a, b) => (a['weekday'] as int).compareTo(b['weekday'] as int),
          );
    sheet([
      Row(
        children: [
          IconTile(
            widget.modernIcons
                ? Icons.menu_book_rounded
                : Icons.menu_book_outlined,
            seed: item['subjectName'],
            size: 46,
          ),
          const SizedBox(width: Sg.gap),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${item['subjectName']}',
                  style: Sg.section.copyWith(fontSize: 20, color: palette.text),
                ),
                Text(
                  '${item['className']}',
                  style: Sg.caption.copyWith(color: palette.muted),
                ),
              ],
            ),
          ),
        ],
      ),
      if (item['teacher'] is Map) ...[
        const SizedBox(height: Sg.gapM),
        Row(
          children: [
            InitialsAvatar('${item['teacher']['name']}', size: 34),
            const SizedBox(width: Sg.gapS),
            Text(
              '${item['teacher']['name']}',
              style: Sg.caption.copyWith(color: palette.muted),
            ),
          ],
        ),
      ],
      const SizedBox(height: Sg.gapL),
      Text('Horário', style: Sg.section.copyWith(color: palette.text)),
      const SizedBox(height: Sg.gapS),
      if (subjectSlots.isEmpty)
        emptyLine('Sem horário publicado.')
      else
        for (final slot in subjectSlots)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Text(
              '${_weekdaysLong[(slot['weekday'] as int) - 1]} · ${_hhmm(slot['startsAt'])} – '
              '${_hhmm(slot['endsAt'])} · ${slot['room'] ?? 'Sala por indicar'}',
              style: Sg.caption.copyWith(color: palette.muted),
            ),
          ),
      const SizedBox(height: Sg.gapL),
      Text('Actividades', style: Sg.section.copyWith(color: palette.text)),
      const SizedBox(height: Sg.gapS),
      if (subjectTasks.isEmpty) emptyLine('Sem actividades publicadas.'),
      for (final task in subjectTasks)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${task['title']}',
                style: Sg.itemTitle.copyWith(color: palette.text),
              ),
              Text(
                deadline(task['due']),
                style: Sg.caption.copyWith(color: palette.muted),
              ),
            ],
          ),
        ),
    ]);
  }

  void taskSheet(Map<String, dynamic> task, AcademicCatalog catalog) => sheet([
    Text(
      '${task['title']}',
      style: Sg.title.copyWith(fontSize: 22, color: palette.text),
    ),
    const SizedBox(height: Sg.gapS),
    Text(
      '${catalog.subject(task['classSubjectId'])} · ${deadline(task['due'])}',
      style: Sg.caption.copyWith(color: palette.muted),
    ),
    const SizedBox(height: Sg.gapM),
    Text(
      task['instructions'] as String? ?? 'Sem instruções adicionais.',
      style: Sg.body.copyWith(color: palette.text),
    ),
    const Footnote(
      'A entrega de trabalhos ainda não está disponível neste cliente.',
    ),
  ]);

  void noticeSheet(Map<String, dynamic> notice) => sheet([
    Row(
      children: [
        Expanded(
          child: Text(
            '${notice['title']}',
            style: Sg.title.copyWith(fontSize: 22, color: palette.text),
          ),
        ),
        if (notice['pinned'] == true) const StateBadge('Fixado'),
      ],
    ),
    const SizedBox(height: Sg.gapS),
    Text(
      '${notice['subjectName'] ?? (notice['audience'] == 'school' ? 'Toda a escola' : 'Turma')}'
      ' · ${deadline(notice['publishedAt'])}',
      style: Sg.caption.copyWith(color: palette.muted),
    ),
    const SizedBox(height: Sg.gapM),
    Text('${notice['body']}', style: Sg.body.copyWith(color: palette.text)),
  ]);
}
