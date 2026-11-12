import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/repositories/attendance_repository.dart'
    show isoDay;
import 'package:yft_school_system/core/sga/sga_attendance.dart';
import 'package:yft_school_system/core/sga/sga_config.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/utils/responsive_utils.dart';
import 'package:yft_school_system/core/widgets/profile_photo_avatar.dart';
import 'package:yft_school_system/core/widgets/section_widgets.dart';
import 'package:yft_school_system/features/calendar/application/school_events.dart';

final _lessonsProvider = FutureProvider.autoDispose
    .family<({String date, List<SgaLesson> lessons}), String>(
      (ref, day) => ref.read(sgaAttendanceRepositoryProvider).lessons(day),
    );

final _sheetProvider = FutureProvider.autoDispose.family<SgaCallSheet, String>(
  (ref, id) => ref.read(sgaAttendanceRepositoryProvider).sheet(id),
);

/// Modo SIGA: a chamada é por aula, como no SIGA. Escolhe-se a aula do dia e
/// marca-se cada aluno; gravar fecha a chamada no SIGA.
class SgaAttendanceScreen extends ConsumerStatefulWidget {
  const SgaAttendanceScreen({super.key});

  @override
  ConsumerState<SgaAttendanceScreen> createState() =>
      _SgaAttendanceScreenState();
}

class _SgaAttendanceScreenState extends ConsumerState<SgaAttendanceScreen> {
  DateTime _day = dayOnly(DateTime.now());

  String get _iso => isoDay(_day);

  Future<void> _pickDay() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _day,
      firstDate: DateTime(_day.year - 1),
      lastDate: dayOnly(DateTime.now()),
      helpText: 'Dia das aulas',
    );
    if (picked != null) setState(() => _day = dayOnly(picked));
  }

  @override
  Widget build(BuildContext context) {
    final pad = getResponsiveHorizontalPadding(context);
    final today = dayOnly(DateTime.now());
    final configured = SgaConfig.fromEnvironment.portalUrl.isNotEmpty;
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text(
          'Marcar presenças',
          style: TextStyle(fontWeight: FontWeight.w600),
        ),
      ),
      body: ResponsiveConstrainedContent(
        child: !configured
            ? const EmptyHint(
                icon: LucideIcons.settings,
                message:
                    'Esta versão da app não tem o endereço do portal do SIGA (SGA_PORTAL_URL).',
              )
            : Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: EdgeInsets.symmetric(
                      horizontal: pad.left,
                      vertical: 4,
                    ),
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
                  Expanded(child: _lessons(pad)),
                ],
              ),
      ),
    );
  }

  Widget _lessons(EdgeInsets pad) {
    final async = ref.watch(_lessonsProvider(_iso));
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => EmptyHint(
        icon: LucideIcons.wifiOff,
        message: e is SgaRejected
            ? e.message
            : 'Não foi possível carregar as aulas.',
        action: TextButton(
          onPressed: () => ref.invalidate(_lessonsProvider(_iso)),
          child: const Text('Tentar de novo'),
        ),
      ),
      data: (r) {
        final lessons = r.lessons
            .where((l) => l.status != 'cancelled')
            .toList();
        if (lessons.isEmpty) {
          return const EmptyHint(
            icon: LucideIcons.calendarX,
            message: 'Não tem aulas neste dia no horário do SIGA.',
          );
        }
        return RefreshIndicator(
          onRefresh: () async => ref.invalidate(_lessonsProvider(_iso)),
          child: ListView.separated(
            padding: EdgeInsets.fromLTRB(pad.left, 0, pad.right, 16),
            itemCount: lessons.length,
            separatorBuilder: (_, _) => const SizedBox(height: 8),
            itemBuilder: (context, i) {
              final l = lessons[i];
              return SoftCard(
                onTap: () async {
                  await Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => _CallSheetScreen(lessonId: l.id),
                    ),
                  );
                  ref.invalidate(_lessonsProvider(_iso));
                },
                child: Row(
                  children: [
                    IconTile(
                      icon: subjectIcon(l.subjectName),
                      color: subjectColor(l.subjectName),
                      size: 40,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            l.subjectName,
                            style: TextStyle(
                              fontSize: 15,
                              color: AppColors.textPrimary,
                            ),
                          ),
                          Text(
                            [
                              l.className,
                              '${l.startsAt}–${l.endsAt}',
                              if (l.room != null && l.room!.isNotEmpty) l.room!,
                            ].join(' · '),
                            style: TextStyle(
                              fontSize: 12,
                              color: AppColors.textSecondary,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Text(
                      l.done ? 'Feita' : 'Por fazer',
                      style: TextStyle(
                        fontSize: 12,
                        color: l.done ? AppColors.success : AppColors.warning,
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        );
      },
    );
  }
}

class _CallSheetScreen extends ConsumerStatefulWidget {
  final String lessonId;
  const _CallSheetScreen({required this.lessonId});

  @override
  ConsumerState<_CallSheetScreen> createState() => _CallSheetScreenState();
}

class _CallSheetScreenState extends ConsumerState<_CallSheetScreen> {
  final Map<String, String> _edits = {};
  bool _saving = false;

  /// Por marcar conta como presente, como no ecrã antigo.
  String _status(SgaCallStudent s) {
    final v = _edits[s.studentId] ?? s.status;
    return v == 'not_registered' ? 'present' : v;
  }

  Future<String?> _askReason() async {
    final controller = TextEditingController();
    final reason = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Corrigir chamada'),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLines: 3,
          decoration: const InputDecoration(
            hintText: 'Motivo da correcção (fica registado no SIGA)',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, controller.text.trim()),
            child: const Text('Corrigir'),
          ),
        ],
      ),
    );
    controller.dispose();
    return reason;
  }

  Future<void> _save(SgaCallSheet sheet) async {
    String? reason;
    if (sheet.lesson.done) {
      reason = await _askReason();
      if (reason == null) return;
      if (reason.length < 5) {
        _say('O motivo tem de ter pelo menos 5 caracteres.', error: true);
        return;
      }
    }
    setState(() => _saving = true);
    try {
      await ref.read(sgaAttendanceRepositoryProvider).save(sheet.lesson.id, {
        for (final s in sheet.students) s.studentId: _status(s),
      }, reason: reason);
      if (!mounted) return;
      final absent = sheet.students.where((s) => _status(s) == 'absent').length;
      _say(
        absent == 0
            ? 'Chamada gravada: todos presentes.'
            : 'Chamada gravada: $absent ${absent == 1 ? 'falta' : 'faltas'}.',
      );
      Navigator.pop(context);
    } on SgaRejected catch (e) {
      if (mounted) {
        setState(() => _saving = false);
        _say(e.message, error: true);
      }
    }
  }

  void _say(String text, {bool error = false}) =>
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(text),
          backgroundColor: error ? AppColors.error : null,
        ),
      );

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(_sheetProvider(widget.lessonId));
    final pad = getResponsiveHorizontalPadding(context);
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: Text(
          async.whenOrNull(
                data: (s) => '${s.lesson.subjectName} · ${s.lesson.className}',
              ) ??
              'Chamada',
          style: const TextStyle(fontWeight: FontWeight.w600),
        ),
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => EmptyHint(
          icon: LucideIcons.wifiOff,
          message: e is SgaRejected
              ? e.message
              : 'Não foi possível abrir a chamada.',
          action: TextButton(
            onPressed: () => ref.invalidate(_sheetProvider(widget.lessonId)),
            child: const Text('Tentar de novo'),
          ),
        ),
        data: (sheet) {
          if (sheet.students.isEmpty) {
            return const EmptyHint(
              icon: LucideIcons.users,
              message: 'Esta turma não tem alunos matriculados.',
            );
          }
          final absent = sheet.students
              .where((s) => _status(s) == 'absent')
              .length;
          return Column(
            children: [
              Padding(
                padding: EdgeInsets.fromLTRB(pad.left, 8, pad.right - 8, 4),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        '${sheet.students.length - absent} presentes · $absent ${absent == 1 ? 'falta' : 'faltas'}'
                        '${sheet.lesson.done ? ' · já feita' : ''}',
                        style: TextStyle(
                          fontSize: 13,
                          color: AppColors.textSecondary,
                        ),
                      ),
                    ),
                    TextButton(
                      onPressed: () => setState(() {
                        for (final s in sheet.students) {
                          _edits[s.studentId] = 'present';
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
                  itemCount: sheet.students.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 8),
                  itemBuilder: (context, i) {
                    final s = sheet.students[i];
                    final status = _status(s);
                    final shown =
                        const {'present', 'absent', 'late'}.contains(status)
                        ? status
                        : 'present';
                    final tint = switch (shown) {
                      'absent' => AppColors.error,
                      'late' => AppColors.warning,
                      _ => AppColors.success,
                    };
                    return SoftCard(
                      padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
                      child: Row(
                        children: [
                          ProfilePhotoCircle(
                            imageUrl: s.photoUrl,
                            radius: 20,
                            fallbackLabel: s.name,
                          ),
                          const SizedBox(width: 12),
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
                                // Estados que a app não marca (justificada, saída antecipada)
                                // ficam como o SIGA os tem, até se mudarem aqui.
                                if (status == 'excused' ||
                                    status == 'early_exit')
                                  Text(
                                    status == 'excused'
                                        ? 'Falta justificada'
                                        : 'Saída antecipada',
                                    style: TextStyle(
                                      fontSize: 12,
                                      color: AppColors.textSecondary,
                                    ),
                                  ),
                              ],
                            ),
                          ),
                          SegmentedButton<String>(
                            showSelectedIcon: false,
                            style: SegmentedButton.styleFrom(
                              visualDensity: VisualDensity.compact,
                              selectedBackgroundColor: tint.withValues(
                                alpha: 0.15,
                              ),
                              selectedForegroundColor: tint,
                            ),
                            segments: const [
                              ButtonSegment(
                                value: 'present',
                                label: Text('P'),
                                tooltip: 'Presente',
                              ),
                              ButtonSegment(
                                value: 'late',
                                label: Text('A'),
                                tooltip: 'Atraso',
                              ),
                              ButtonSegment(
                                value: 'absent',
                                label: Text('F'),
                                tooltip: 'Falta',
                              ),
                            ],
                            selected: {shown},
                            onSelectionChanged: (v) =>
                                setState(() => _edits[s.studentId] = v.first),
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
                      onPressed: _saving ? null : () => _save(sheet),
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
                              sheet.lesson.done
                                  ? 'Corrigir chamada'
                                  : 'Gravar chamada',
                            ),
                    ),
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
