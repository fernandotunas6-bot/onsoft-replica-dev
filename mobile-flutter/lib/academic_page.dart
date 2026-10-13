import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'academic.dart';
import 'gateway.dart';

class DataPage extends StatefulWidget {
  const DataPage({super.key, required this.gateway, required this.path, required this.name, this.groupId});
  final MobileGateway gateway;
  final String path;
  final String name;
  final String? groupId;
  @override
  State<DataPage> createState() => _DataPageState();
}
class _DataPageState extends State<DataPage> {
  late Future<Map<String, dynamic>> data;
  Timer? clock;
  String query = '';
  DateTime selected = luandaClock(DateTime.now());
  @override
  void initState() {
    super.initState(); load();
    clock = Timer.periodic(const Duration(minutes: 1), (_) { if (mounted) setState(() {}); });
  }
  @override
  void dispose() { clock?.cancel(); super.dispose(); }
  void load() { data = widget.gateway.read(widget.path == '/messages' ? 'chat' : 'academic'); }
  bool matches(String value) => value.toLowerCase().contains(query);
  Widget heading(String label, {VoidCallback? onTap}) => Padding(padding: const EdgeInsets.symmetric(vertical: 16),
    child: Row(children: [Expanded(child: Text(label, style: Theme.of(context).textTheme.titleMedium)),
      if (onTap != null) TextButton(onPressed: onTap, child: const Text('Ver todas'))]));
  Widget empty(String label) => Padding(padding: const EdgeInsets.symmetric(vertical: 24), child: Text(label));
  void detail(Map<String, dynamic> item, AcademicCatalog catalog) {
    final tasks = catalog.tasks.where((t) => t['classSubjectId'] == item['classSubjectId']).toList();
    showModalBottomSheet<void>(context: context, showDragHandle: true, isScrollControlled: true,
      builder: (context) => SafeArea(child: SizedBox(height: MediaQuery.sizeOf(context).height * .65,
        child: ListView(padding: const EdgeInsets.all(24), children: [
          Text('${item['subjectName']}', style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 8), Text('${item['className']}'),
          if (item['teacher'] is Map) Padding(padding: const EdgeInsets.only(top: 8), child: Text('${item['teacher']['name']}')),
          const SizedBox(height: 24), Text('Actividades', style: Theme.of(context).textTheme.titleMedium),
          if (tasks.isEmpty) empty('Sem actividades publicadas.'),
          for (final task in tasks) ListTile(contentPadding: EdgeInsets.zero,
            title: Text('${task['title']}'), subtitle: Text('${task['instructions'] ?? ''}\n${deadline(task['due'])}')),
        ]))));
  }
  String deadline(dynamic due) {
    if (due == null) return 'Sem prazo indicado';
    final local = luandaClock(DateTime.parse(due as String));
    return '${local.day}/${local.month}/${local.year} · ${local.hour.toString().padLeft(2,'0')}:${local.minute.toString().padLeft(2,'0')}';
  }
  Widget subjectRow(Map<String, dynamic> item, AcademicCatalog catalog) => ListTile(
    contentPadding: const EdgeInsets.symmetric(vertical: 8),
    leading: Icon(Icons.menu_book_outlined, color: Theme.of(context).colorScheme.primary),
    title: Text('${item['subjectName']}'), subtitle: Text('${item['className']}'),
    trailing: const Icon(Icons.chevron_right), onTap: () => detail(item, catalog));
  Widget slotRow(Map<String, dynamic> slot, AcademicCatalog catalog) => ListTile(
    contentPadding: const EdgeInsets.symmetric(vertical: 8), leading: const Icon(Icons.schedule),
    title: Text(catalog.subject(slot['classSubjectId'])),
    subtitle: Text('${(slot['startsAt'] as String).substring(0,5)} – ${(slot['endsAt'] as String).substring(0,5)} · ${slot['room'] ?? 'Sala por indicar'}'
      '${slot['publication'] == 'legacy' ? '\nHorário legado: confirme com a escola' : ''}'));
  @override
  Widget build(BuildContext context) => FutureBuilder<Map<String, dynamic>>(future: data, builder: (context, snapshot) {
    if (snapshot.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
    if (snapshot.hasError) return failure('Não foi possível carregar os dados. Verifique a ligação ou volte a entrar.');
    final result = snapshot.data!;
    AcademicCatalog? catalog;
    if (widget.path != '/messages') {
      try { catalog = AcademicCatalog.parse(result); }
      on FormatException { return failure('Os dados recebidos não correspondem ao catálogo institucional.'); }
    }
    final isClasses = widget.path == '/classes';
    final isClass = widget.path == '/class';
    final isTasks = widget.path == '/tasks';
    final isHome = widget.path == '/home';
    final isCalendar = widget.path == '/calendar';
    final isChat = widget.path == '/messages';
    final title = isHome ? 'Bem-vindo, ${widget.name}' : isCalendar ? 'Calendário' : isChat ? 'Mensagens' : isClasses ? 'Turmas' : isClass ? 'Espaço da turma' : isTasks ? 'Tarefas' : 'Disciplinas';
    final subjects = catalog?.classes.where((c) => (!isClass || c['classGroupId'] == widget.groupId) && matches('${c['subjectName']} ${c['className']}')).toList() ?? [];
    final slots = catalog?.forDay(selected).where((s) => matches(catalog!.subject(s['classSubjectId']))).toList() ?? [];
    final now = luandaClock(DateTime.now());
    final next = catalog?.upcoming(DateTime.now());
    return RefreshIndicator(onRefresh: () async {
      setState(load);
      // FutureBuilder displays request errors without leaking an unhandled refresh Future.
      try { await data; } catch (_) { /* visible error state */ }
    }, child: ListView(physics: const AlwaysScrollableScrollPhysics(), padding: const EdgeInsets.all(24), children: [
      Text(title, style: Theme.of(context).textTheme.headlineSmall), const SizedBox(height: 8),
      if (isHome) Text(widget.gateway.role == 'professor' ? 'O seu dia de ensino, organizado.' : 'O seu dia de aprendizagem, organizado.',
        style: Theme.of(context).textTheme.bodyMedium),
      const SizedBox(height: 24),
      if (!isHome) ...[TextField(decoration: const InputDecoration(hintText: 'Pesquisar…', prefixIcon: Icon(Icons.search)),
        onChanged: (value) => setState(() { query = value.trim().toLowerCase(); })), const SizedBox(height: 16)],
      if (isHome) ...[
        if (next != null) Container(padding: const EdgeInsets.all(20), decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(18), border: Border.all(color: Theme.of(context).colorScheme.outlineVariant)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(minutes(next['startsAt'])! <= now.hour * 60 + now.minute ? 'Aula prevista em curso' : 'Próxima aula prevista',
              style: TextStyle(color: Theme.of(context).colorScheme.primary)),
            const SizedBox(height: 8), Text(catalog!.subject(next['classSubjectId']), style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8), Text('${(next['startsAt'] as String).substring(0,5)} – ${(next['endsAt'] as String).substring(0,5)} · ${next['room'] ?? 'Sala por indicar'}'),
          ])) else empty('Sem mais aulas publicadas para hoje.'),
        heading('Disciplinas'),
        for (final item in subjects.take(3)) subjectRow(item, catalog!),
        if (subjects.isEmpty) empty('Sem disciplinas neste vínculo.'),
        heading('Actividades publicadas'),
        if (catalog!.tasks.isEmpty) empty('Sem actividades publicadas.'),
        for (final task in (catalog.tasks.toList()..sort((a,b) => (a['due'] as String? ?? '9999').compareTo(b['due'] as String? ?? '9999'))).take(5))
          ListTile(contentPadding: const EdgeInsets.symmetric(vertical: 8), leading: const Icon(Icons.assignment_outlined),
            title: Text('${task['title']}'), subtitle: Text('${catalog.subject(task['classSubjectId'])}\n${deadline(task['due'])}')),
      ] else if (isTasks) ...[
        if (catalog!.tasks.where((t) => matches(t['title'] as String)).isEmpty) empty('Sem tarefas para os filtros escolhidos.'),
        for (final task in catalog.tasks.where((t) => matches(t['title'] as String)))
          ListTile(leading: const Icon(Icons.assignment_outlined), title: Text(task['title'] as String),
            subtitle: Text('${catalog.subject(task['classSubjectId'])}\n${deadline(task['due'])}'),
            trailing: const Icon(Icons.chevron_right), onTap: () => taskDetail(task)),
      ] else if (isClasses) ...[
        if (subjects.isEmpty) empty('Sem turmas autorizadas para os filtros escolhidos.'),
        for (final group in groupClasses(subjects).entries)
          ListTile(leading: const Icon(Icons.groups_outlined), title: Text(group.value.first['className'] as String),
            subtitle: Text('${group.value.length} disciplinas'), trailing: const Icon(Icons.chevron_right),
            onTap: () => context.go('/more/classes/${Uri.encodeComponent(group.key)}')),
      ] else if (isClass) ...[
        if (subjects.isEmpty) empty('Esta turma não está disponível no seu contexto actual.'),
        for (final item in subjects) subjectRow(item, catalog!),
        heading('Horário de hoje'),
        for (final slot in catalog!.forDay(now).where((s) => subjects.any((c) => c['classSubjectId'] == s['classSubjectId']))) slotRow(slot, catalog),
        const SizedBox(height: 16),
        const Text('Participantes, presenças e integrações da turma dependem de permissões e contratos próprios. Não são apresentados dados de colegas neste incremento.'),
      ] else if (isCalendar) ...[
        Row(children: [
          IconButton(tooltip: 'Dia anterior', onPressed: () => setState(() { selected = selected.subtract(const Duration(days: 1)); }), icon: const Icon(Icons.chevron_left)),
          Expanded(child: Center(child: Text('${['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'][selected.weekday-1]} · ${selected.day}/${selected.month}'))),
          IconButton(tooltip: 'Dia seguinte', onPressed: () => setState(() { selected = selected.add(const Duration(days: 1)); }), icon: const Icon(Icons.chevron_right)),
        ]),
        Align(alignment: Alignment.centerRight, child: TextButton(onPressed: () => setState(() { selected = luandaClock(DateTime.now()); }), child: const Text('Hoje'))),
        if (slots.isEmpty) empty('Sem aulas neste dia para os filtros escolhidos.'),
        for (final slot in slots) slotRow(slot, catalog!),
        const SizedBox(height: 16), const Text('Horário previsto. Presenças e cancelamentos serão apresentados após integração dos respectivos registos.'),
      ] else if (isChat) ...[
        if (result['threads'] is! List) empty('Não foi possível interpretar a lista de conversas.')
        else ...[
          if ((result['threads'] as List).isEmpty) empty('Sem conversas nesta escola.'),
          for (final thread in result['threads'] as List)
            if (thread is Map && thread['name'] is String && matches(thread['name'] as String))
              ListTile(contentPadding: const EdgeInsets.symmetric(vertical: 8), leading: const Icon(Icons.chat_bubble_outline),
                title: Text(thread['name'] as String), subtitle: Text('${thread['unread']} não lidas')),
          const SizedBox(height: 16), const Text('O histórico e o envio de mensagens estão em integração.'),
        ],
      ] else ...[
        if (subjects.isEmpty) empty('Sem disciplinas para os filtros escolhidos.'),
        for (final item in subjects) subjectRow(item, catalog!),
      ],
    ]));
  });
  Map<String, List<Map<String, dynamic>>> groupClasses(List<Map<String, dynamic>> classes) {
    final groups = <String, List<Map<String, dynamic>>>{};
    for (final item in classes) {
      final id = item['classGroupId'];
      if (id is String) (groups[id] ??= []).add(item);
    }
    return groups;
  }
  void taskDetail(Map<String, dynamic> task) {
    showModalBottomSheet<void>(context: context, showDragHandle: true, isScrollControlled: true,
      builder: (context) => SafeArea(child: SingleChildScrollView(padding: const EdgeInsets.all(24), child: Column(
        mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(task['title'] as String, style: Theme.of(context).textTheme.headlineSmall), const SizedBox(height: 16),
          Text(deadline(task['due'])), const SizedBox(height: 16), Text(task['instructions'] as String? ?? 'Sem instruções adicionais.'),
          const SizedBox(height: 24), const Text('A entrega de trabalhos ainda não está disponível neste cliente.'),
        ]))));
  }
  Widget failure(String message) => Center(child: Padding(padding: const EdgeInsets.all(24), child: Column(mainAxisSize: MainAxisSize.min, children: [
    const Icon(Icons.cloud_off_outlined, size: 32), const SizedBox(height: 16), Text(message, textAlign: TextAlign.center),
    const SizedBox(height: 16), FilledButton.tonal(onPressed: () => setState(load), child: const Text('Tentar novamente')),
  ])));
}
