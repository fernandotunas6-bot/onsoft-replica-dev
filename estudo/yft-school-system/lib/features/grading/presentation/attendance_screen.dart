import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/models/school_class.dart';
import 'package:yft_school_system/core/network/api_client.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';
import 'package:yft_school_system/core/repositories/attendance_repository.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/utils/media_url.dart';
import 'package:yft_school_system/core/utils/responsive_utils.dart';
import 'package:yft_school_system/core/widgets/profile_photo_avatar.dart';
import 'package:yft_school_system/core/widgets/section_widgets.dart';
import 'package:yft_school_system/features/academics/application/academic_state.dart';
import 'package:yft_school_system/features/calendar/application/school_events.dart';

/// Marcar presenças: escolhe-se a turma e o dia; quem não foi marcado conta
/// como presente. Gravar o mesmo dia outra vez corrige.
class AttendanceScreen extends ConsumerStatefulWidget {
  const AttendanceScreen({super.key});

  @override
  ConsumerState<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceScreenState extends ConsumerState<AttendanceScreen> {
  String? _classId;
  DateTime _day = dayOnly(DateTime.now());

  /// Alterações feitas neste ecrã, por cima do que veio do servidor.
  final Map<String, bool> _edits = {};
  bool _saving = false;

  ({String classId, String day}) _key(String classId) =>
      (classId: classId, day: isoDay(_day));

  Future<void> _pickDay() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _day,
      firstDate: DateTime(_day.year - 1),
      lastDate: dayOnly(DateTime.now()),
      helpText: 'Dia das presenças',
    );
    if (picked != null) {
      setState(() {
        _day = dayOnly(picked);
        _edits.clear();
      });
    }
  }

  Future<void> _save(String classId, List<AttendanceEntry> entries) async {
    setState(() => _saving = true);
    final records = {
      for (final e in entries) e.studentId: _edits[e.studentId] ?? e.present ?? true,
    };
    try {
      await ref.read(attendanceRepositoryProvider).save(classId, _day, records);
      ref.invalidate(attendanceRosterProvider(_key(classId)));
      ref.invalidate(attendanceSummaryProvider(classId));
      if (!mounted) return;
      final absent = records.values.where((p) => !p).length;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            absent == 0
                ? 'Presenças guardadas: todos presentes.'
                : 'Presenças guardadas: $absent ${absent == 1 ? 'falta' : 'faltas'}.',
          ),
        ),
      );
      setState(() {
        _edits.clear();
        _saving = false;
      });
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: AppColors.error,
          content: Text(
            e.response?.statusCode == 400
                ? 'A lista mudou entretanto. Actualize e tente de novo.'
                : 'Não foi possível guardar. Verifique a ligação.',
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final classes =
        ref.watch(classesProvider).whenOrNull(data: (c) => c) ??
        const <SchoolClass>[];
    // Ordem: a escolhida aqui, a escolhida em "As minhas turmas", a primeira
    // turma do horário do professor.
    final mine =
        ref.watch(teacherClassIdsProvider).whenOrNull(data: (s) => s) ??
        const <String>{};
    final preferred = _classId ??
        ref.watch(selectedClassProvider)?.id ??
        classes.where((c) => mine.contains(c.id)).firstOrNull?.id;
    final classId = classes.any((c) => c.id == preferred)
        ? preferred
        : classes.firstOrNull?.id;
    final pad = getResponsiveHorizontalPadding(context);
    final today = dayOnly(DateTime.now());

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text(
          'Marcar presenças',
          style: TextStyle(fontWeight: FontWeight.w600),
        ),
      ),
      body: ResponsiveConstrainedContent(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (classes.length > 1)
              Padding(
                padding: EdgeInsets.fromLTRB(pad.left, 4, 0, 8),
                child: PillTabs(
                  labels: [for (final c in classes) c.className],
                  selected: classes.indexWhere((c) => c.id == classId),
                  onSelected: (i) => setState(() {
                    _classId = classes[i].id;
                    _edits.clear();
                  }),
                ),
              ),
            Padding(
              padding: EdgeInsets.symmetric(horizontal: pad.left),
              child: OutlinedButton.icon(
                onPressed: _pickDay,
                icon: const Icon(LucideIcons.calendar, size: 18),
                label: Text(
                  _day == today
                      ? 'Hoje · ${formatDayMonth(_day)}'
                      : '${weekdayShort[_day.weekday - 1]} · ${formatDayMonth(_day)}',
                ),
              ),
            ),
            const SizedBox(height: 8),
            Expanded(
              child: classId == null
                  ? const EmptyHint(
                      icon: LucideIcons.layoutGrid,
                      message: 'Ainda não há turmas.',
                    )
                  : _roster(classId, pad),
            ),
          ],
        ),
      ),
    );
  }

  Widget _roster(String classId, EdgeInsets pad) {
    final key = _key(classId);
    final rosterAsync = ref.watch(attendanceRosterProvider(key));
    final base = ref.read(dioProvider).options.baseUrl;

    return rosterAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (_, _) => EmptyHint(
        icon: LucideIcons.wifiOff,
        message: 'Não foi possível carregar a turma.',
        action: TextButton(
          onPressed: () => ref.invalidate(attendanceRosterProvider(key)),
          child: const Text('Tentar de novo'),
        ),
      ),
      data: (roster) {
        final entries = roster.entries;
        if (entries.isEmpty) {
          return const EmptyHint(
            icon: LucideIcons.users,
            message: 'Esta turma não tem alunos activos.',
          );
        }
        bool isPresent(AttendanceEntry e) =>
            _edits[e.studentId] ?? e.present ?? true;
        final absent = entries.where((e) => !isPresent(e)).length;

        return Column(
          children: [
            Padding(
              padding: EdgeInsets.fromLTRB(pad.left, 4, pad.right - 8, 4),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      '${entries.length - absent} presentes · $absent ${absent == 1 ? 'falta' : 'faltas'}'
                      '${roster.marked ? ' · já marcado' : ''}',
                      style: TextStyle(
                        fontSize: 13,
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ),
                  TextButton(
                    onPressed: () => setState(() {
                      for (final e in entries) {
                        _edits[e.studentId] = true;
                      }
                    }),
                    child: const Text('Todos presentes'),
                  ),
                ],
              ),
            ),
            Expanded(
              child: ListView.separated(
                padding: EdgeInsets.fromLTRB(pad.left, 0, pad.right, 16),
                itemCount: entries.length,
                separatorBuilder: (_, _) => const SizedBox(height: 8),
                itemBuilder: (context, i) {
                  final e = entries[i];
                  final present = isPresent(e);
                  return SoftCard(
                    onTap: () =>
                        setState(() => _edits[e.studentId] = !present),
                    padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
                    child: Row(
                      children: [
                        ProfilePhotoCircle(
                          imageUrl: profilePhotoUrlFromKey(e.photoUrl, base),
                          radius: 20,
                          fallbackLabel: e.name,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            e.name,
                            style: TextStyle(
                              fontSize: 15,
                              color: AppColors.textPrimary,
                            ),
                          ),
                        ),
                        SegmentedButton<bool>(
                          showSelectedIcon: false,
                          style: SegmentedButton.styleFrom(
                            visualDensity: VisualDensity.compact,
                            selectedBackgroundColor: present
                                ? AppColors.success.withValues(alpha: 0.15)
                                : AppColors.error.withValues(alpha: 0.15),
                            selectedForegroundColor: present
                                ? AppColors.success
                                : AppColors.error,
                          ),
                          segments: const [
                            ButtonSegment(value: true, label: Text('P')),
                            ButtonSegment(value: false, label: Text('F')),
                          ],
                          selected: {present},
                          onSelectionChanged: (v) =>
                              setState(() => _edits[e.studentId] = v.first),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
            SafeArea(
              top: false,
              child: Padding(
                padding: EdgeInsets.fromLTRB(pad.left, 4, pad.right, 12),
                child: SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: ElevatedButton(
                    onPressed: _saving ? null : () => _save(classId, entries),
                    child: _saving
                        ? SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: AppColors.onPrimary,
                            ),
                          )
                        : Text(
                            roster.marked
                                ? 'Guardar correcção'
                                : 'Guardar presenças',
                          ),
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}
