import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/models/school_class.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/utils/responsive_utils.dart';
import 'package:yft_school_system/core/widgets/section_widgets.dart';

/// Faltas por turma: dias marcados e, por aluno, presenças e faltas
/// (os que faltam mais aparecem primeiro).
class TotalAttendanceScreen extends ConsumerStatefulWidget {
  const TotalAttendanceScreen({super.key});

  @override
  ConsumerState<TotalAttendanceScreen> createState() =>
      _TotalAttendanceScreenState();
}

class _TotalAttendanceScreenState extends ConsumerState<TotalAttendanceScreen> {
  String? _classId;

  @override
  Widget build(BuildContext context) {
    final classesAsync = ref.watch(classesProvider);
    final pad = getResponsiveHorizontalPadding(context);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Faltas', style: TextStyle(fontWeight: FontWeight.w600)),
        actions: [
          IconButton(
            tooltip: 'Marcar presenças',
            onPressed: () => context.push('/attendance'),
            icon: const Icon(LucideIcons.userCheck),
          ),
        ],
      ),
      body: ResponsiveConstrainedContent(
        child: classesAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (_, _) => EmptyHint(
            icon: LucideIcons.wifiOff,
            message: 'Não foi possível carregar as turmas.',
            action: TextButton(
              onPressed: () => ref.invalidate(classesProvider),
              child: const Text('Tentar de novo'),
            ),
          ),
          data: (classes) {
            if (classes.isEmpty) {
              return const EmptyHint(
                icon: LucideIcons.layoutGrid,
                message: 'Ainda não há turmas.',
              );
            }
            final cls = classes.firstWhere(
              (c) => c.id == _classId,
              orElse: () => classes.first,
            );
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (classes.length > 1)
                  Padding(
                    padding: EdgeInsets.fromLTRB(pad.left, 4, 0, 8),
                    child: PillTabs(
                      labels: [for (final c in classes) c.className],
                      selected: classes.indexOf(cls),
                      onSelected: (i) =>
                          setState(() => _classId = classes[i].id),
                    ),
                  ),
                Expanded(child: _Summary(cls: cls, pad: pad)),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _Summary extends ConsumerWidget {
  final SchoolClass cls;
  final EdgeInsets pad;

  const _Summary({required this.cls, required this.pad});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summaryAsync = ref.watch(attendanceSummaryProvider(cls.id));
    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(attendanceSummaryProvider(cls.id));
        await ref.read(attendanceSummaryProvider(cls.id).future);
      },
      child: summaryAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, _) => ListView(
          children: [
            EmptyHint(
              icon: LucideIcons.wifiOff,
              message: 'Não foi possível carregar as faltas.',
              action: TextButton(
                onPressed: () =>
                    ref.invalidate(attendanceSummaryProvider(cls.id)),
                child: const Text('Tentar de novo'),
              ),
            ),
          ],
        ),
        data: (summary) {
          if (summary.daysMarked == 0) {
            return ListView(
              children: const [
                EmptyHint(
                  icon: LucideIcons.calendarCheck,
                  message:
                      'Ainda não foram marcadas presenças nesta turma.',
                ),
              ],
            );
          }
          return ListView(
            padding: EdgeInsets.fromLTRB(pad.left, 4, pad.right, 32),
            children: [
              Text(
                '${summary.daysMarked} ${summary.daysMarked == 1 ? 'dia marcado' : 'dias marcados'}',
                style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
              ),
              const SizedBox(height: 12),
              for (final s in summary.students)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: SoftCard(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 12,
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                s.name,
                                style: TextStyle(
                                  fontSize: 15,
                                  color: AppColors.textPrimary,
                                ),
                              ),
                              Text(
                                '${s.presentDays} ${s.presentDays == 1 ? 'presença' : 'presenças'}',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: AppColors.textSecondary,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: (s.absentDays > 0
                                    ? AppColors.error
                                    : AppColors.success)
                                .withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Text(
                            '${s.absentDays} ${s.absentDays == 1 ? 'falta' : 'faltas'}',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: s.absentDays > 0
                                  ? AppColors.error
                                  : AppColors.success,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}
