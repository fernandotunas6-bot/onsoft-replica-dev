import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/auth/auth_state.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/utils/responsive_utils.dart';
import 'package:yft_school_system/core/widgets/app_shell.dart';
import 'package:yft_school_system/core/widgets/section_widgets.dart';
import 'package:yft_school_system/features/calendar/application/school_events.dart';
import 'package:yft_school_system/features/dashboard/presentation/notices_screen.dart';
import 'package:yft_school_system/features/dashboard/presentation/providers/notices_providers.dart';

/// Calendário: agenda do dia, escolhido numa faixa semanal, e horários.
class CalendarScreen extends ConsumerStatefulWidget {
  const CalendarScreen({super.key});

  @override
  ConsumerState<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends ConsumerState<CalendarScreen> {
  int _tab = 0;
  DateTime _selected = dayOnly(DateTime.now());

  DateTime get _weekStart =>
      _selected.subtract(Duration(days: _selected.weekday - 1));

  void _shiftWeek(int weeks) =>
      setState(() => _selected = _selected.add(Duration(days: 7 * weeks)));

  @override
  Widget build(BuildContext context) {
    final role = ref.watch(authProvider)?.role;
    final pad = getResponsiveHorizontalPadding(context);

    return AppShell(
      tab: AppTab.calendar,
      floatingActionButton: role == UserRole.admin
          ? FloatingActionButton(
              tooltip: 'Calendário académico',
              onPressed: () => context.push('/academic-calendar'),
              child: const Icon(LucideIcons.plus),
            )
          : null,
      body: SafeArea(
        child: ResponsiveConstrainedContent(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: EdgeInsets.fromLTRB(pad.left, 16, pad.right - 8, 12),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Calendário',
                        style: Theme.of(context).textTheme.displayMedium,
                      ),
                    ),
                    IconButton(
                      tooltip: 'Hoje',
                      onPressed: () => setState(
                        () => _selected = dayOnly(DateTime.now()),
                      ),
                      icon: Icon(LucideIcons.calendarCheck,
                          color: AppColors.secondary),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: EdgeInsets.symmetric(horizontal: pad.left),
                child: _Segmented(
                  labels: const ['Agenda', 'Horários'],
                  selected: _tab,
                  onSelected: (i) => setState(() => _tab = i),
                ),
              ),
              const SizedBox(height: 16),
              Expanded(
                child: _tab == 0 ? _agenda(pad) : _timetable(),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _agenda(EdgeInsets pad) {
    final eventsAsync = ref.watch(schoolEventsProvider);
    final today = dayOnly(DateTime.now());
    final days = [for (var i = 0; i < 7; i++) _weekStart.add(Duration(days: i))];
    final eventDays =
        eventsAsync.whenOrNull(data: (e) => e.map((x) => x.date).toSet()) ??
        const <DateTime>{};

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: EdgeInsets.symmetric(horizontal: pad.left - 8),
          child: Row(
            children: [
              IconButton(
                tooltip: 'Semana anterior',
                visualDensity: VisualDensity.compact,
                onPressed: () => _shiftWeek(-1),
                icon: Icon(Icons.chevron_left_rounded,
                    color: AppColors.textSecondary),
              ),
              for (final d in days)
                Expanded(
                  child: _DayCell(
                    day: d,
                    selected: d == _selected,
                    isToday: d == today,
                    hasEvents: eventDays.contains(d),
                    onTap: () => setState(() => _selected = d),
                  ),
                ),
              IconButton(
                tooltip: 'Semana seguinte',
                visualDensity: VisualDensity.compact,
                onPressed: () => _shiftWeek(1),
                icon: Icon(Icons.chevron_right_rounded,
                    color: AppColors.textSecondary),
              ),
            ],
          ),
        ),
        Padding(
          padding: EdgeInsets.fromLTRB(pad.left, 16, pad.right, 8),
          child: Text(
            _selected == today
                ? 'Hoje · ${formatDayMonth(_selected)}'
                : '${weekdayShort[_selected.weekday - 1]} · ${formatDayMonth(_selected)}',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: AppColors.textPrimary,
            ),
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(academicCalendarProvider);
              ref.invalidate(parentNoticesProvider);
              await ref.read(schoolEventsProvider.future);
            },
            child: eventsAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (_, _) => ListView(
                children: const [
                  EmptyHint(
                    icon: LucideIcons.wifiOff,
                    message: 'Não foi possível carregar a agenda.',
                  ),
                ],
              ),
              data: (events) {
                final ofDay =
                    events.where((e) => e.date == _selected).toList();
                if (ofDay.isEmpty) {
                  return ListView(
                    children: const [
                      EmptyHint(
                        icon: LucideIcons.calendarDays,
                        message: 'Nada marcado para este dia.',
                      ),
                    ],
                  );
                }
                return ListView.separated(
                  padding: EdgeInsets.fromLTRB(pad.left, 4, pad.right, 96),
                  itemCount: ofDay.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 10),
                  itemBuilder: (context, i) => _EventTile(
                    event: ofDay[i],
                    onTap: ofDay[i].notice == null
                        ? null
                        : () => openNoticeSheet(context, ref, ofDay[i].notice!),
                  ),
                );
              },
            ),
          ),
        ),
      ],
    );
  }

  Widget _timetable() {
    // O horário semanal ainda não tem tabela na API.
    return ListView(
      children: const [
        EmptyHint(
          icon: LucideIcons.clock,
          message:
              'O horário de aulas ainda não está configurado.\n'
              'Quando a escola o publicar, aparece aqui por dia da semana.',
        ),
      ],
    );
  }
}

class _Segmented extends StatelessWidget {
  final List<String> labels;
  final int selected;
  final ValueChanged<int> onSelected;

  const _Segmented({
    required this.labels,
    required this.selected,
    required this.onSelected,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: AppColors.textSecondary.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(24),
      ),
      child: Row(
        children: [
          for (var i = 0; i < labels.length; i++)
            Expanded(
              child: GestureDetector(
                onTap: () => onSelected(i),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 180),
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  decoration: BoxDecoration(
                    color: i == selected ? AppColors.primary : Colors.transparent,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    labels[i],
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight:
                          i == selected ? FontWeight.w600 : FontWeight.w400,
                      color: i == selected
                          ? AppColors.onPrimary
                          : AppColors.textSecondary,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _DayCell extends StatelessWidget {
  final DateTime day;
  final bool selected;
  final bool isToday;
  final bool hasEvents;
  final VoidCallback onTap;

  const _DayCell({
    required this.day,
    required this.selected,
    required this.isToday,
    required this.hasEvents,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final fg = selected
        ? AppColors.onPrimary
        : isToday
        ? AppColors.primary
        : AppColors.textPrimary;
    return GestureDetector(
      onTap: onTap,
      child: Column(
        children: [
          Text(
            weekdayShort[day.weekday - 1],
            style: TextStyle(
              fontSize: 12,
              color: isToday ? AppColors.primary : AppColors.textSecondary,
            ),
          ),
          const SizedBox(height: 6),
          AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: selected ? AppColors.primary : Colors.transparent,
              borderRadius: BorderRadius.circular(10),
            ),
            alignment: Alignment.center,
            child: Text(
              '${day.day}',
              style: TextStyle(
                fontSize: 15,
                fontWeight: selected || isToday ? FontWeight.w600 : FontWeight.w400,
                color: fg,
              ),
            ),
          ),
          const SizedBox(height: 4),
          Container(
            width: 5,
            height: 5,
            decoration: BoxDecoration(
              color: hasEvents && !selected
                  ? AppColors.primary
                  : Colors.transparent,
              shape: BoxShape.circle,
            ),
          ),
        ],
      ),
    );
  }
}

class _EventTile extends StatelessWidget {
  final SchoolEvent event;
  final VoidCallback? onTap;

  const _EventTile({required this.event, this.onTap});

  @override
  Widget build(BuildContext context) {
    return SoftCard(
      onTap: onTap,
      padding: const EdgeInsets.fromLTRB(0, 14, 16, 14),
      child: Row(
        children: [
          Container(
            width: 4,
            height: 40,
            margin: const EdgeInsets.only(right: 14),
            decoration: BoxDecoration(
              color: event.color,
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
                  event.title,
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                    color: AppColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  event.subtitle,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
                ),
              ],
            ),
          ),
          if (onTap != null)
            Icon(Icons.chevron_right_rounded, color: AppColors.textSecondary),
        ],
      ),
    );
  }
}
