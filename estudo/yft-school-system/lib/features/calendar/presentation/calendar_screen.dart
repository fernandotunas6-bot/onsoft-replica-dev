import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/auth/auth_state.dart';
import 'package:yft_school_system/core/models/school_class.dart';
import 'package:yft_school_system/core/models/timetable_slot.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/utils/responsive_utils.dart';
import 'package:yft_school_system/core/widgets/app_shell.dart';
import 'package:yft_school_system/core/widgets/section_widgets.dart';
import 'package:yft_school_system/features/calendar/application/school_events.dart';
import 'package:yft_school_system/features/calendar/presentation/add_slot_sheet.dart';
import 'package:yft_school_system/features/calendar/presentation/slot_tile.dart';
import 'package:yft_school_system/features/dashboard/presentation/notices_screen.dart';
import 'package:yft_school_system/features/dashboard/presentation/providers/notices_providers.dart';

/// Calendário: agenda do dia, escolhido numa faixa semanal, e o horário da
/// semana por turma.
class CalendarScreen extends ConsumerStatefulWidget {
  const CalendarScreen({super.key});

  @override
  ConsumerState<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends ConsumerState<CalendarScreen> {
  int _tab = 0;
  DateTime _selected = dayOnly(DateTime.now());
  String? _classId;

  DateTime get _weekStart =>
      _selected.subtract(Duration(days: _selected.weekday - 1));

  void _shiftWeek(int weeks) =>
      setState(() => _selected = _selected.add(Duration(days: 7 * weeks)));

  @override
  Widget build(BuildContext context) {
    final role = ref.watch(authProvider)?.role;
    final isAdmin = role == UserRole.admin;
    final pad = getResponsiveHorizontalPadding(context);
    final classes =
        ref.watch(classesProvider).whenOrNull(data: (c) => c) ??
        const <SchoolClass>[];
    final classId = classes.any((c) => c.id == _classId)
        ? _classId
        : classes.firstOrNull?.id;

    return AppShell(
      tab: AppTab.calendar,
      floatingActionButton: !isAdmin
          ? null
          : _tab == 1
          ? FloatingActionButton(
              tooltip: 'Acrescentar tempo',
              onPressed: classes.isEmpty
                  ? null
                  : () => showAddSlotSheet(
                      context,
                      classes: classes,
                      classId: classId,
                      weekday: _selected.weekday,
                    ),
              child: const Icon(LucideIcons.plus),
            )
          : FloatingActionButton(
              tooltip: 'Calendário académico',
              onPressed: () => context.push('/academic-calendar'),
              child: const Icon(LucideIcons.calendarRange),
            ),
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
              // Com mais de uma turma (admin, professor, vários educandos),
              // escolhe-se qual; com uma só, não há nada a escolher.
              if (classes.length > 1)
                Padding(
                  padding: EdgeInsets.fromLTRB(pad.left, 12, 0, 0),
                  child: PillTabs(
                    labels: [for (final c in classes) c.className],
                    selected: classes.indexWhere((c) => c.id == classId),
                    onSelected: (i) =>
                        setState(() => _classId = classes[i].id),
                  ),
                ),
              const SizedBox(height: 16),
              Expanded(
                child: _tab == 0
                    ? _agenda(pad, classId)
                    : _timetable(pad, classId, isAdmin),
              ),
            ],
          ),
        ),
      ),
    );
  }

  AsyncValue<List<TimetableSlot>> _slots(String? classId) => classId == null
      ? const AsyncValue.data(<TimetableSlot>[])
      : ref.watch(timetableProvider(classId));

  Widget _agenda(EdgeInsets pad, String? classId) {
    final eventsAsync = ref.watch(schoolEventsProvider);
    final slotsAsync = _slots(classId);
    final today = dayOnly(DateTime.now());
    final days = [for (var i = 0; i < 7; i++) _weekStart.add(Duration(days: i))];
    final eventDays =
        eventsAsync.whenOrNull(data: (e) => e.map((x) => x.date).toSet()) ??
        const <DateTime>{};
    final slotDays =
        slotsAsync.whenOrNull(data: (s) => s.map((x) => x.weekday).toSet()) ??
        const <int>{};

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
                    hasEvents:
                        eventDays.contains(d) || slotDays.contains(d.weekday),
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
              if (classId != null) ref.invalidate(timetableProvider(classId));
              await ref.read(schoolEventsProvider.future);
            },
            child: Builder(
              builder: (context) {
                if (eventsAsync.isLoading && slotsAsync.isLoading) {
                  return const Center(child: CircularProgressIndicator());
                }
                final slots = (slotsAsync.whenOrNull(data: (s) => s) ??
                        const <TimetableSlot>[])
                    .where((s) => s.weekday == _selected.weekday)
                    .toList();
                final events = (eventsAsync.whenOrNull(data: (e) => e) ??
                        const <SchoolEvent>[])
                    .where((e) => e.date == _selected)
                    .toList();
                if (slots.isEmpty && events.isEmpty) {
                  return ListView(
                    children: [
                      EmptyHint(
                        icon: LucideIcons.calendarDays,
                        message: eventsAsync.hasError && slotsAsync.hasError
                            ? 'Não foi possível carregar a agenda.'
                            : 'Nada marcado para este dia.',
                      ),
                    ],
                  );
                }
                final now = DateTime.now();
                final nowMin = now.hour * 60 + now.minute;
                return ListView(
                  padding: EdgeInsets.fromLTRB(pad.left, 4, pad.right, 96),
                  children: [
                    for (final s in slots)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: SlotTile(
                          slot: s,
                          live: _selected == today &&
                              nowMin >= s.startMinutes &&
                              nowMin < s.endMinutes,
                        ),
                      ),
                    if (slots.isNotEmpty && events.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(0, 10, 0, 10),
                        child: Text(
                          'Acontecimentos',
                          style: TextStyle(
                            fontSize: 13,
                            color: AppColors.textSecondary,
                          ),
                        ),
                      ),
                    for (final e in events)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: _EventTile(
                          event: e,
                          onTap: e.notice == null
                              ? null
                              : () => openNoticeSheet(context, ref, e.notice!),
                        ),
                      ),
                  ],
                );
              },
            ),
          ),
        ),
      ],
    );
  }

  Widget _timetable(EdgeInsets pad, String? classId, bool isAdmin) {
    final slotsAsync = _slots(classId);
    return RefreshIndicator(
      onRefresh: () async {
        if (classId != null) {
          ref.invalidate(timetableProvider(classId));
          await ref.read(timetableProvider(classId).future);
        }
      },
      child: slotsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, _) => ListView(
          children: [
            EmptyHint(
              icon: LucideIcons.wifiOff,
              message: 'Não foi possível carregar o horário.',
              action: TextButton(
                onPressed: () => ref.invalidate(timetableProvider(classId)),
                child: const Text('Tentar de novo'),
              ),
            ),
          ],
        ),
        data: (slots) {
          if (slots.isEmpty) {
            return ListView(
              children: [
                EmptyHint(
                  icon: LucideIcons.clock,
                  message: classId == null
                      ? 'Ainda não há turmas associadas a esta conta.'
                      : isAdmin
                      ? 'Esta turma ainda não tem horário.\n'
                            'Toque em + para acrescentar o primeiro tempo.'
                      : 'O horário desta turma ainda não foi publicado.',
                ),
              ],
            );
          }
          final byDay = <int, List<TimetableSlot>>{};
          for (final s in slots) {
            byDay.putIfAbsent(s.weekday, () => []).add(s);
          }
          final days = byDay.keys.toList()..sort();
          return ListView(
            padding: EdgeInsets.fromLTRB(pad.left, 0, pad.right, 96),
            children: [
              for (final d in days) ...[
                Padding(
                  padding: const EdgeInsets.fromLTRB(0, 8, 0, 10),
                  child: Text(
                    weekdayLong[d - 1],
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: d == DateTime.now().weekday
                          ? AppColors.primary
                          : AppColors.textPrimary,
                    ),
                  ),
                ),
                for (final s in byDay[d]!)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: SlotTile(
                      slot: s,
                      onLongPress: isAdmin ? () => _confirmDelete(s) : null,
                    ),
                  ),
              ],
              if (isAdmin)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    'Mantenha um tempo premido para o apagar.',
                    style: TextStyle(
                      fontSize: 12,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _confirmDelete(TimetableSlot s) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Apagar tempo?'),
        content: Text(
          '${s.label} · ${weekdayLong[s.weekday - 1]}, ${s.startTime}–${s.endTime}',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancelar'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text('Apagar', style: TextStyle(color: AppColors.error)),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      await ref.read(timetableRepositoryProvider).deleteSlot(s.id);
      ref.invalidate(timetableProvider(s.classId));
      ref.invalidate(timetableProvider(null));
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Não foi possível apagar o tempo.')),
      );
    }
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
