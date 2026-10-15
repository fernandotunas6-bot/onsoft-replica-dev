import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/auth/auth_state.dart';
import 'package:yft_school_system/core/models/school_class.dart';
import 'package:yft_school_system/core/models/subject.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/utils/responsive_utils.dart';
import 'package:yft_school_system/core/widgets/app_shell.dart';
import 'package:yft_school_system/core/widgets/section_widgets.dart';

/// Disciplinas da escola, filtráveis por turma.
///
/// O mockup filtra por "Em andamento / Concluídas", mas a API não guarda o
/// progresso de cada disciplina; o filtro que existe é a turma.
class SubjectsScreen extends ConsumerStatefulWidget {
  const SubjectsScreen({super.key});

  @override
  ConsumerState<SubjectsScreen> createState() => _SubjectsScreenState();
}

class _SubjectsScreenState extends ConsumerState<SubjectsScreen> {
  int _tab = 0;
  bool _searching = false;
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final role = ref.watch(authProvider)?.role;
    final subjectsAsync = ref.watch(subjectsProvider(null));
    // A lista de turmas pode não estar aberta a todos os papéis: sem ela,
    // fica só "Todas".
    final classes =
        ref.watch(classesProvider).whenOrNull(data: (c) => c) ??
        const <SchoolClass>[];
    final tabs = ['Todas', for (final c in classes) c.className];
    final tab = _tab < tabs.length ? _tab : 0;
    final pad = getResponsiveHorizontalPadding(context);

    return AppShell(
      tab: AppTab.subjects,
      floatingActionButton: role == UserRole.admin
          ? FloatingActionButton(
              tooltip: 'Gerir disciplinas',
              onPressed: () => context.push('/subjects'),
              child: const Icon(LucideIcons.settings2),
            )
          : null,
      body: SafeArea(
        child: ResponsiveConstrainedContent(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: EdgeInsets.fromLTRB(pad.left, 16, pad.right - 8, 8),
                child: Row(
                  children: [
                    Expanded(
                      child: _searching
                          ? TextField(
                              autofocus: true,
                              onChanged: (v) => setState(() => _query = v),
                              decoration: const InputDecoration(
                                hintText: 'Pesquisar disciplina…',
                                contentPadding: EdgeInsets.symmetric(
                                  horizontal: 16,
                                  vertical: 12,
                                ),
                              ),
                            )
                          : Text(
                              'Disciplinas',
                              style: Theme.of(context).textTheme.displayMedium,
                            ),
                    ),
                    IconButton(
                      tooltip: _searching ? 'Fechar pesquisa' : 'Pesquisar',
                      onPressed: () => setState(() {
                        _searching = !_searching;
                        if (!_searching) _query = '';
                      }),
                      icon: Icon(
                        _searching ? LucideIcons.x : LucideIcons.search,
                        color: AppColors.secondary,
                      ),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: EdgeInsets.symmetric(horizontal: pad.left),
                child: PillTabs(
                  labels: tabs,
                  selected: tab,
                  onSelected: (i) => setState(() => _tab = i),
                ),
              ),
              const SizedBox(height: 12),
              Expanded(
                child: RefreshIndicator(
                  onRefresh: () async {
                    ref.invalidate(subjectsProvider(null));
                    ref.invalidate(classesProvider);
                  },
                  child: subjectsAsync.when(
                    loading: () =>
                        const Center(child: CircularProgressIndicator()),
                    error: (e, _) => ListView(
                      children: [
                        EmptyHint(
                          icon: LucideIcons.wifiOff,
                          message: 'Não foi possível carregar as disciplinas.',
                          action: TextButton(
                            onPressed: () =>
                                ref.invalidate(subjectsProvider(null)),
                            child: const Text('Tentar de novo'),
                          ),
                        ),
                      ],
                    ),
                    data: (subjects) {
                      final classId = tab == 0 ? null : classes[tab - 1].id;
                      final q = _query.trim().toLowerCase();
                      final list = subjects
                          .where(
                            (s) =>
                                classId == null || s.classIds.contains(classId),
                          )
                          .where(
                            (s) => q.isEmpty || s.name.toLowerCase().contains(q),
                          )
                          .toList();
                      if (list.isEmpty) {
                        return ListView(
                          children: [
                            EmptyHint(
                              icon: LucideIcons.bookOpen,
                              message: q.isNotEmpty
                                  ? 'Nenhuma disciplina corresponde a "$_query".'
                                  : 'Ainda não há disciplinas nesta lista.',
                            ),
                          ],
                        );
                      }
                      return ListView.separated(
                        padding: EdgeInsets.fromLTRB(
                          pad.left,
                          4,
                          pad.right,
                          96,
                        ),
                        itemCount: list.length,
                        separatorBuilder: (_, _) => const SizedBox(height: 10),
                        itemBuilder: (context, i) => _SubjectCard(
                          subject: list[i],
                          classes: classes,
                        ),
                      );
                    },
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SubjectCard extends StatelessWidget {
  final Subject subject;
  final List<SchoolClass> classes;

  const _SubjectCard({required this.subject, required this.classes});

  List<String> get _classNames => [
    for (final id in subject.classIds)
      classes
              .where((c) => c.id == id)
              .map((c) => c.className)
              .firstOrNull ??
          '',
  ].where((n) => n.isNotEmpty).toList();

  @override
  Widget build(BuildContext context) {
    final color = subjectColor(subject.name);
    final names = _classNames;
    final count = subject.classIds.length;
    final caption = names.isNotEmpty
        ? names.join(' · ')
        : count == 1
        ? '1 turma'
        : '$count turmas';

    return SoftCard(
      onTap: () => _showDetails(context, names),
      child: Row(
        children: [
          IconTile(icon: subjectIcon(subject.name), color: color),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  subject.name,
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                    color: AppColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  caption,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
                ),
              ],
            ),
          ),
          Icon(Icons.chevron_right_rounded, color: AppColors.textSecondary),
        ],
      ),
    );
  }

  void _showDetails(BuildContext context, List<String> names) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  IconTile(
                    icon: subjectIcon(subject.name),
                    color: subjectColor(subject.name),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Text(
                      subject.name,
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textPrimary,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              Text(
                'Turmas',
                style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
              ),
              const SizedBox(height: 8),
              if (names.isEmpty)
                Text(
                  subject.classIds.isEmpty
                      ? 'Ainda não está atribuída a nenhuma turma.'
                      : '${subject.classIds.length} turma(s)',
                  style: TextStyle(color: AppColors.textPrimary),
                )
              else
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final n in names)
                      Chip(
                        label: Text(n),
                        side: BorderSide(color: AppColors.border),
                        backgroundColor: AppColors.background,
                      ),
                  ],
                ),
            ],
          ),
        ),
      ),
    );
  }
}
