import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:yft_school_system/core/models/timetable_slot.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/widgets/section_widgets.dart';
import 'package:yft_school_system/features/calendar/application/school_events.dart';

/// "Disciplinas" no início: as primeiras três, com ligação para a lista.
class SubjectsPreview extends ConsumerWidget {
  const SubjectsPreview({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final subjectsAsync = ref.watch(subjectsProvider(null));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionHeader(
          title: 'Disciplinas',
          actionLabel: 'Ver todas',
          onAction: () => context.go('/disciplinas'),
        ),
        subjectsAsync.when(
          loading: () => const Padding(
            padding: EdgeInsets.all(24),
            child: Center(child: CircularProgressIndicator()),
          ),
          error: (_, _) => Text(
            'Não foi possível carregar as disciplinas.',
            style: TextStyle(color: AppColors.textSecondary),
          ),
          data: (subjects) {
            if (subjects.isEmpty) {
              return Text(
                'Ainda não há disciplinas registadas.',
                style: TextStyle(color: AppColors.textSecondary),
              );
            }
            return Column(
              children: [
                for (final s in subjects.take(3))
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: SoftCard(
                      onTap: () => context.go('/disciplinas'),
                      child: Row(
                        children: [
                          IconTile(
                            icon: subjectIcon(s.name),
                            color: subjectColor(s.name),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  s.name,
                                  style: TextStyle(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w500,
                                    color: AppColors.textPrimary,
                                  ),
                                ),
                                Text(
                                  s.classIds.length == 1
                                      ? '1 turma'
                                      : '${s.classIds.length} turmas',
                                  style: TextStyle(
                                    fontSize: 13,
                                    color: AppColors.textSecondary,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Icon(Icons.chevron_right_rounded,
                              color: AppColors.textSecondary),
                        ],
                      ),
                    ),
                  ),
              ],
            );
          },
        ),
      ],
    );
  }
}

/// "Próximas actividades": o que vem a seguir na agenda da escola.
class UpcomingActivities extends ConsumerWidget {
  const UpcomingActivities({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final eventsAsync = ref.watch(schoolEventsProvider);
    final today = dayOnly(DateTime.now());

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionHeader(
          title: 'Próximas actividades',
          actionLabel: 'Ver todos',
          onAction: () => context.go('/calendario'),
        ),
        eventsAsync.when(
          loading: () => const Padding(
            padding: EdgeInsets.all(24),
            child: Center(child: CircularProgressIndicator()),
          ),
          error: (_, _) => const SizedBox.shrink(),
          data: (events) {
            final upcoming =
                events.where((e) => !e.date.isBefore(today)).take(3).toList();
            if (upcoming.isEmpty) {
              return Text(
                'Sem actividades marcadas para os próximos dias.',
                style: TextStyle(color: AppColors.textSecondary),
              );
            }
            return Column(
              children: [
                for (final e in upcoming)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: SoftCard(
                      onTap: () => context.go('/calendario'),
                      child: Row(
                        children: [
                          Container(
                            width: 4,
                            height: 40,
                            decoration: BoxDecoration(
                              color: e.color,
                              borderRadius: BorderRadius.circular(2),
                            ),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  e.title,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w500,
                                    color: AppColors.textPrimary,
                                  ),
                                ),
                                Text(
                                  e.subtitle,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    fontSize: 13,
                                    color: AppColors.textSecondary,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            e.date == today ? 'Hoje' : formatDayMonth(e.date),
                            style: TextStyle(
                              fontSize: 12,
                              color: AppColors.textSecondary,
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
      ],
    );
  }
}

/// "Aula agora" (ou "Próxima aula" hoje), a partir do horário das turmas
/// que o utilizador pode ver. Não aparece quando não há aulas hoje.
class CurrentClassCard extends ConsumerWidget {
  const CurrentClassCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final slots =
        ref.watch(timetableProvider(null)).whenOrNull(data: (s) => s) ??
        const <TimetableSlot>[];
    final now = DateTime.now();
    final nowMin = now.hour * 60 + now.minute;
    final today = slots
        .where((s) => s.weekday == now.weekday && !s.isBreak)
        .toList()
      ..sort((a, b) => a.startMinutes.compareTo(b.startMinutes));
    final live = today
        .where((s) => nowMin >= s.startMinutes && nowMin < s.endMinutes)
        .firstOrNull;
    final slot = live ?? today.where((s) => s.startMinutes > nowMin).firstOrNull;
    if (slot == null) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(bottom: 24),
      child: SoftCard(
        onTap: () => context.go('/calendario'),
        padding: const EdgeInsets.fromLTRB(0, 16, 16, 16),
        child: Row(
          children: [
            Container(
              width: 4,
              height: 56,
              margin: const EdgeInsets.only(right: 16),
              decoration: BoxDecoration(
                color: AppColors.primary,
                borderRadius: const BorderRadius.horizontal(
                  right: Radius.circular(2),
                ),
              ),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    live != null ? 'Aula agora' : 'Próxima aula',
                    style: TextStyle(
                      fontSize: 13,
                      color: AppColors.textSecondary,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    slot.label,
                    style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textPrimary,
                    ),
                  ),
                  Text(
                    slot.caption,
                    style: TextStyle(
                      fontSize: 13,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
            FilledButton(
              onPressed: () => context.go('/calendario'),
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: AppColors.onPrimary,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              child: const Text('Horário'),
            ),
          ],
        ),
      ),
    );
  }
}
