import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../../core/auth/auth_state.dart';
import '../../../core/sga/sga_config.dart';
import '../../../core/sga/sga_work.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/utils/responsive_utils.dart';
import '../../../core/widgets/section_widgets.dart';
import '../../../core/widgets/skeleton.dart';
import 'work_widgets.dart';

enum _WorkFilter { pending, delivered, graded }

/// Os trabalhos do ano corrente, de todas as disciplinas: o que está por fazer,
/// o que foi entregue e o que já tem nota. A entrega faz-se no portal do SIGA.
class WorkScreen extends ConsumerStatefulWidget {
  const WorkScreen({super.key});

  @override
  ConsumerState<WorkScreen> createState() => _WorkScreenState();
}

class _WorkScreenState extends ConsumerState<WorkScreen> {
  _WorkFilter _filter = _WorkFilter.pending;

  bool _matches(WorkTask t) => switch (_filter) {
    _WorkFilter.pending => t.pending,
    _WorkFilter.delivered => t.state == WorkState.submitted,
    _WorkFilter.graded => t.state == WorkState.returned || t.state == WorkState.missed,
  };

  @override
  Widget build(BuildContext context) {
    final studentId = ref.watch(homeStudentIdProvider);
    final work = ref.watch(workOverviewProvider(studentId));
    final pad = getResponsiveHorizontalPadding(context);
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Trabalhos', style: TextStyle(fontWeight: FontWeight.w600)),
      ),
      body: !sgaMode
          ? const _Message(
              icon: LucideIcons.clipboardList,
              text: 'Os trabalhos chegam pela conta do SIGA.',
            )
          : RefreshIndicator(
              onRefresh: () => ref.refresh(workOverviewProvider(studentId).future),
              child: work.when(
                loading: () => ListView(
                  padding: pad.copyWith(top: 16, bottom: 32),
                  children: [
                    for (var i = 0; i < 4; i++) ...[
                      const SkeletonCard(lines: 1),
                      const SizedBox(height: 10),
                    ],
                  ],
                ),
                error: (_, _) => _Message(
                  icon: LucideIcons.wifiOff,
                  text: 'Não foi possível carregar os trabalhos. Verifique a ligação.',
                  action: TextButton.icon(
                    onPressed: () => ref.invalidate(workOverviewProvider(studentId)),
                    icon: const Icon(LucideIcons.refreshCw, size: 16),
                    label: const Text('Tentar de novo'),
                  ),
                ),
                data: (overview) {
                  final tasks = overview?.tasks ?? const <WorkTask>[];
                  final shown = tasks.where(_matches).toList();
                  final pendingCount = tasks.where((t) => t.pending).length;
                  return ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: pad.copyWith(top: 16, bottom: 32),
                    children: [
                      SegmentedButton<_WorkFilter>(
                        showSelectedIcon: false,
                        segments: [
                          ButtonSegment(
                            value: _WorkFilter.pending,
                            label: Text(pendingCount > 0 ? 'Por fazer · $pendingCount' : 'Por fazer'),
                          ),
                          const ButtonSegment(value: _WorkFilter.delivered, label: Text('Entregues')),
                          const ButtonSegment(value: _WorkFilter.graded, label: Text('Com nota')),
                        ],
                        selected: {_filter},
                        onSelectionChanged: (s) => setState(() => _filter = s.first),
                      ),
                      if (overview?.average != null) ...[
                        const SizedBox(height: 12),
                        Text(
                          'Média dos trabalhos com nota: ${formatGrade(overview!.average!)} / 20',
                          style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
                        ),
                      ],
                      const SizedBox(height: 16),
                      if (shown.isEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 32),
                          child: _Message(
                            icon: _filter == _WorkFilter.pending
                                ? LucideIcons.partyPopper
                                : LucideIcons.inbox,
                            text: switch (_filter) {
                              _WorkFilter.pending => 'Tudo em dia: não há trabalhos por entregar.',
                              _WorkFilter.delivered => 'Nenhum trabalho à espera de nota.',
                              _WorkFilter.graded => 'Ainda não há trabalhos com nota.',
                            },
                          ),
                        )
                      else
                        for (final task in shown) ...[
                          WorkTaskTile(
                            task: task,
                            onTap: () => _showDetail(context, task, overview?.canSubmit ?? false),
                          ),
                          const SizedBox(height: 10),
                        ],
                    ],
                  );
                },
              ),
            ),
    );
  }

  void _showDetail(BuildContext context, WorkTask task, bool canSubmit) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: AppColors.surface,
      builder: (_) => _WorkDetail(task: task, canSubmit: canSubmit),
    );
  }
}

class _WorkDetail extends ConsumerWidget {
  final WorkTask task;
  final bool canSubmit;

  const _WorkDetail({required this.task, required this.canSubmit});

  String _date(DateTime d) =>
      '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isStudent = ref.watch(authProvider)?.isStudent ?? false;
    final grade = task.grade;
    final portal = SgaConfig.fromEnvironment.portalUrl;
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                IconTile(icon: workKindIcon(task.kind), color: workStateStyle(task.state).color),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        task.title,
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                          color: AppColors.textPrimary,
                        ),
                      ),
                      if (task.subjectName.isNotEmpty)
                        Text(
                          task.subjectName,
                          style: TextStyle(fontSize: 14, color: AppColors.textSecondary),
                        ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                WorkStatePill(task.state),
                _Chip(
                  icon: LucideIcons.calendar,
                  text: task.dueOn == null ? 'Sem prazo' : 'Prazo: ${_date(task.dueOn!)}',
                ),
                if (task.countsForPauta)
                  const _Chip(icon: LucideIcons.award, text: 'Conta para a pauta'),
              ],
            ),
            if (task.description?.trim().isNotEmpty ?? false) ...[
              const SizedBox(height: 16),
              Text(
                task.description!.trim(),
                style: TextStyle(fontSize: 15, height: 1.45, color: AppColors.textPrimary),
              ),
            ],
            if (task.submittedAt != null) ...[
              const SizedBox(height: 16),
              Text(
                [
                  task.onPaper ? 'Entregue em papel' : 'Entregue',
                  'a ${_date(task.submittedAt!.toLocal())}',
                  if (task.late) '(depois do prazo)',
                ].join(' '),
                style: TextStyle(fontSize: 14, color: AppColors.textSecondary),
              ),
            ],
            if (grade != null || (task.feedback?.trim().isNotEmpty ?? false)) ...[
              const SizedBox(height: 16),
              SoftCard(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (grade != null) ...[
                      Text(
                        formatGrade(grade),
                        style: TextStyle(
                          fontSize: 32,
                          fontWeight: FontWeight.w700,
                          color: gradeColor(grade),
                        ),
                      ),
                      const SizedBox(width: 14),
                    ],
                    Expanded(
                      child: Text(
                        task.feedback?.trim().isNotEmpty ?? false
                            ? task.feedback!.trim()
                            : 'Nota atribuída pelo professor.',
                        style: TextStyle(fontSize: 14, height: 1.4, color: AppColors.textPrimary),
                      ),
                    ),
                  ],
                ),
              ),
            ],
            if (task.pending) ...[
              const SizedBox(height: 20),
              SoftCard(
                onTap: portal.isEmpty
                    ? null
                    : () {
                        Clipboard.setData(ClipboardData(text: portal));
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Endereço do portal copiado.')),
                        );
                      },
                child: Row(
                  children: [
                    Icon(LucideIcons.link, size: 20, color: AppColors.primary),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        canSubmit && isStudent
                            ? 'Entregue no portal do SIGA: Disciplinas › ${task.subjectName.isEmpty ? 'a disciplina' : task.subjectName} › Trabalhos. Toque para copiar o endereço.'
                            : 'O aluno entrega no portal do SIGA, com a sua conta.',
                        style: TextStyle(fontSize: 14, height: 1.4, color: AppColors.textPrimary),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  final IconData icon;
  final String text;

  const _Chip({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.background,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: AppColors.textSecondary),
          const SizedBox(width: 5),
          Text(text, style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
        ],
      ),
    );
  }
}

class _Message extends StatelessWidget {
  final IconData icon;
  final String text;
  final Widget? action;

  const _Message({required this.icon, required this.text, this.action});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconTile(icon: icon, color: AppColors.primary, size: 56),
            const SizedBox(height: 14),
            Text(
              text,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 15, color: AppColors.textSecondary),
            ),
            if (action != null) ...[const SizedBox(height: 8), action!],
          ],
        ),
      ),
    );
  }
}
