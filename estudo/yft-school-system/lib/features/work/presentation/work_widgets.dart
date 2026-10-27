import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../../core/auth/auth_state.dart';
import '../../../core/sga/sga_config.dart';
import '../../../core/sga/sga_work.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/section_widgets.dart';
import '../../../core/widgets/skeleton.dart';
import '../../reports/presentation/providers/wards_provider.dart';

/// Cor, rótulo e ícone de cada estado de um trabalho.
({String label, Color color, IconData icon}) workStateStyle(WorkState state) =>
    switch (state) {
      WorkState.overdue => (
        label: 'Atrasado',
        color: AppColors.error,
        icon: LucideIcons.alarmClock,
      ),
      WorkState.open => (
        label: 'Por entregar',
        color: AppColors.primary,
        icon: LucideIcons.clock,
      ),
      WorkState.submitted => (
        label: 'Entregue',
        color: const Color(0xFF0EA5E9),
        icon: LucideIcons.send,
      ),
      WorkState.returned => (
        label: 'Com nota',
        color: AppColors.success,
        icon: LucideIcons.checkCircle2,
      ),
      WorkState.missed => (
        label: 'Não entregue',
        color: AppColors.textSecondary,
        icon: LucideIcons.xCircle,
      ),
    };

/// Ícone pelo tipo de trabalho do SIGA.
IconData workKindIcon(String kind) => switch (kind) {
  'teste' || 'prova' => LucideIcons.clipboardCheck,
  'apresentacao' || 'apresentação' => LucideIcons.presentation,
  'leitura' => LucideIcons.bookOpen,
  'exercicios' || 'exercícios' => LucideIcons.pencil,
  _ => LucideIcons.fileText,
};

/// «Hoje», «Amanhã», «Em 3 dias», «Há 2 dias» ou a data.
String relativeDay(DateTime? date, {DateTime? now}) {
  if (date == null) return 'Sem prazo';
  final today = DateUtils.dateOnly(now ?? DateTime.now());
  final days = DateUtils.dateOnly(date).difference(today).inDays;
  if (days == 0) return 'Hoje';
  if (days == 1) return 'Amanhã';
  if (days == -1) return 'Ontem';
  if (days > 1 && days <= 7) return 'Em $days dias';
  if (days < -1 && days >= -7) return 'Há ${-days} dias';
  final d = date.day.toString().padLeft(2, '0');
  final m = date.month.toString().padLeft(2, '0');
  return '$d/$m';
}

/// Nota 0–20 com a cor da aprovação (≥ 10).
Color gradeColor(double grade) =>
    grade >= 14 ? AppColors.success : (grade >= 10 ? AppColors.primary : AppColors.error);

String formatGrade(double value) =>
    value == value.roundToDouble() ? value.toStringAsFixed(0) : value.toStringAsFixed(1);

/// Etiqueta arredondada com o estado do trabalho.
class WorkStatePill extends StatelessWidget {
  final WorkState state;

  const WorkStatePill(this.state, {super.key});

  @override
  Widget build(BuildContext context) {
    final style = workStateStyle(state);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: style.color.withValues(alpha: AppColors.isDark ? 0.22 : 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(style.icon, size: 13, color: style.color),
          const SizedBox(width: 5),
          Text(
            style.label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: style.color,
            ),
          ),
        ],
      ),
    );
  }
}

/// Uma linha de trabalho: tipo, título, disciplina e prazo, e o estado (ou a nota).
class WorkTaskTile extends StatelessWidget {
  final WorkTask task;
  final VoidCallback? onTap;

  const WorkTaskTile({super.key, required this.task, this.onTap});

  @override
  Widget build(BuildContext context) {
    final style = workStateStyle(task.state);
    final grade = task.grade;
    final caption = [
      if (task.subjectName.isNotEmpty) task.subjectName,
      task.pending ? relativeDay(task.dueOn) : (task.dueOn == null ? null : relativeDay(task.dueOn)),
    ].whereType<String>().join(' · ');
    return SoftCard(
      onTap: onTap,
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          IconTile(icon: workKindIcon(task.kind), color: style.color, size: 44),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  task.title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  caption,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          if (grade != null)
            _GradeBadge(grade)
          else
            WorkStatePill(task.state),
        ],
      ),
    );
  }
}

class _GradeBadge extends StatelessWidget {
  final double grade;

  const _GradeBadge(this.grade);

  @override
  Widget build(BuildContext context) {
    final color = gradeColor(grade);
    return Container(
      width: 48,
      height: 48,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: color.withValues(alpha: AppColors.isDark ? 0.22 : 0.12),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Text(
        formatGrade(grade),
        style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: color),
      ),
    );
  }
}

/// Encarregado com mais de um educando: escolhe de quem é o Início.
class WardSwitcher extends ConsumerWidget {
  const WardSwitcher({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(authProvider);
    if (!sgaMode || session == null || session.isStudent) return const SizedBox.shrink();
    final wards = ref.watch(wardsProvider).whenOrNull(data: (w) => w) ?? const [];
    if (wards.length < 2) return const SizedBox.shrink();
    final current = ref.watch(homeStudentIdProvider);
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            for (final ward in wards)
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(
                  label: Text(ward.name.split(' ').first),
                  selected: ward.id == current,
                  onSelected: (_) => ref.read(focusWardProvider.notifier).select(ward.id),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// O cartão de destaque do Início: média, próxima avaliação e próxima aula
/// (dos dias seguintes; a de hoje está no cartão «Aula agora»).
class TodayAgendaCard extends ConsumerWidget {
  const TodayAgendaCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!sgaMode) return const SizedBox.shrink();
    final studentId = ref.watch(homeStudentIdProvider);
    final agenda = ref.watch(studentAgendaProvider(studentId));
    return Padding(
      padding: const EdgeInsets.only(bottom: 24),
      child: agenda.when(
        loading: () => const SkeletonCard(lines: 2),
        error: (_, _) => const SizedBox.shrink(),
        data: (a) => a == null ? const SizedBox.shrink() : _AgendaHero(agenda: a),
      ),
    );
  }
}

class _AgendaHero extends StatelessWidget {
  final StudentAgenda agenda;

  const _AgendaHero({required this.agenda});

  @override
  Widget build(BuildContext context) {
    final average = agenda.average;
    final next = agenda.nextAssessment;
    final lesson = agenda.nextLesson;
    // Texto sobre a cor principal: branco ou tinta, o que passar 4,5 de
    // contraste (laranja e verde-água pedem tinta).
    final onHero = AppColors.onPrimary;
    final muted = onHero.withValues(alpha: 0.82);
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: AppColors.primaryGradient,
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: AppColors.primary.withValues(alpha: 0.25),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Média do ano', style: TextStyle(fontSize: 13, color: muted)),
                    const SizedBox(height: 2),
                    Text.rich(
                      TextSpan(
                        children: [
                          TextSpan(
                            text: average == null ? '—' : formatGrade(average),
                            style: TextStyle(
                              fontSize: 34,
                              fontWeight: FontWeight.w600,
                              color: onHero,
                              height: 1.1,
                            ),
                          ),
                          TextSpan(
                            text: ' / 20',
                            style: TextStyle(fontSize: 15, color: muted),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              if (agenda.className != null)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: onHero.withValues(alpha: 0.18),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(LucideIcons.users, size: 14, color: onHero),
                      const SizedBox(width: 6),
                      Text(
                        agenda.className!,
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: onHero,
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
          if (next != null || (lesson != null && lesson.daysAhead > 0)) ...[
            const SizedBox(height: 14),
            Divider(height: 1, color: onHero.withValues(alpha: 0.2)),
            const SizedBox(height: 12),
          ],
          if (next != null)
            _HeroLine(
              icon: LucideIcons.clipboardCheck,
              label: 'Próxima avaliação · ${relativeDay(next.date)}',
              value: [
                next.name,
                if (next.subjectName.isNotEmpty) next.subjectName,
              ].join(' · '),
            ),
          if (lesson != null && lesson.daysAhead > 0) ...[
            if (next != null) const SizedBox(height: 10),
            _HeroLine(
              icon: LucideIcons.calendarClock,
              label: 'Próxima aula · ${lesson.daysAhead == 1 ? 'amanhã' : 'em ${lesson.daysAhead} dias'}',
              value: '${lesson.subjectName} · ${lesson.startsAt}',
            ),
          ],
        ],
      ),
    );
  }
}

class _HeroLine extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const _HeroLine({required this.icon, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(
            color: AppColors.onPrimary.withValues(alpha: 0.18),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(icon, size: 17, color: AppColors.onPrimary),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: TextStyle(
                  fontSize: 12,
                  color: AppColors.onPrimary.withValues(alpha: 0.82),
                ),
              ),
              Text(
                value,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                  color: AppColors.onPrimary,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// Os trabalhos que pedem acção, no Início (até três), com «Ver todos».
class WorkDueCard extends ConsumerWidget {
  const WorkDueCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!sgaMode) return const SizedBox.shrink();
    final studentId = ref.watch(homeStudentIdProvider);
    final work = ref.watch(workOverviewProvider(studentId));
    return Padding(
      padding: const EdgeInsets.only(bottom: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SectionHeader(
            title: 'Trabalhos',
            actionLabel: 'Ver todos',
            onAction: () => context.push('/trabalhos'),
          ),
          work.when(
            loading: () => const SkeletonCard(lines: 1),
            error: (_, _) => const SizedBox.shrink(),
            data: (overview) {
              final pending = overview?.pending ?? const <WorkTask>[];
              if (pending.isEmpty) {
                return SoftCard(
                  onTap: () => context.push('/trabalhos'),
                  child: Row(
                    children: [
                      IconTile(icon: LucideIcons.partyPopper, color: AppColors.success, size: 44),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Text(
                          'Tudo em dia: não há trabalhos por entregar.',
                          style: TextStyle(fontSize: 14, color: AppColors.textPrimary),
                        ),
                      ),
                    ],
                  ),
                );
              }
              return Column(
                children: [
                  for (final task in pending.take(3)) ...[
                    WorkTaskTile(task: task, onTap: () => context.push('/trabalhos')),
                    const SizedBox(height: 10),
                  ],
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}
