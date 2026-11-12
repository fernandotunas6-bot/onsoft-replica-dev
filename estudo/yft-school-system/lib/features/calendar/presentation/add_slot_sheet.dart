import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:yft_school_system/core/models/school_class.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/features/calendar/application/school_events.dart';

/// Folha do admin para acrescentar um tempo ao horário.
Future<void> showAddSlotSheet(
  BuildContext context, {
  required List<SchoolClass> classes,
  String? classId,
  int weekday = 1,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => _AddSlotSheet(
      classes: classes,
      classId: classId ?? classes.first.id,
      weekday: weekday,
    ),
  );
}

class _AddSlotSheet extends ConsumerStatefulWidget {
  final List<SchoolClass> classes;
  final String classId;
  final int weekday;

  const _AddSlotSheet({
    required this.classes,
    required this.classId,
    required this.weekday,
  });

  @override
  ConsumerState<_AddSlotSheet> createState() => _AddSlotSheetState();
}

class _AddSlotSheetState extends ConsumerState<_AddSlotSheet> {
  late String _classId = widget.classId;
  late int _weekday = widget.weekday;
  bool _isBreak = false;
  String? _subjectId;
  String? _teacherUid;
  TimeOfDay _start = const TimeOfDay(hour: 8, minute: 0);
  TimeOfDay _end = const TimeOfDay(hour: 9, minute: 0);
  final _title = TextEditingController(text: 'Intervalo');
  final _room = TextEditingController();
  final _teacher = TextEditingController();
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _title.dispose();
    _room.dispose();
    _teacher.dispose();
    super.dispose();
  }

  String _fmt(TimeOfDay t) =>
      '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

  Future<void> _pick(bool start) async {
    final picked = await showTimePicker(
      context: context,
      initialTime: start ? _start : _end,
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(alwaysUse24HourFormat: true),
        child: child!,
      ),
    );
    if (picked == null) return;
    setState(() {
      if (start) {
        _start = picked;
        // Mantém a duração por omissão de uma hora, se o fim ficar para trás.
        final end = picked.hour * 60 + picked.minute + 60;
        if (_end.hour * 60 + _end.minute <= picked.hour * 60 + picked.minute) {
          _end = TimeOfDay(hour: (end ~/ 60).clamp(0, 23), minute: end % 60);
        }
      } else {
        _end = picked;
      }
    });
  }

  Future<void> _save() async {
    final start = _fmt(_start);
    final end = _fmt(_end);
    if (end.compareTo(start) <= 0) {
      setState(() => _error = 'A hora de fim tem de ser depois do início.');
      return;
    }
    if (!_isBreak && _subjectId == null) {
      setState(() => _error = 'Escolha a disciplina.');
      return;
    }
    if (_isBreak && _title.text.trim().isEmpty) {
      setState(() => _error = 'Dê um nome à pausa.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref
          .read(timetableRepositoryProvider)
          .createSlot(
            classId: _classId,
            subjectId: _isBreak ? null : _subjectId,
            title: _isBreak ? _title.text.trim() : null,
            weekday: _weekday,
            startTime: start,
            endTime: end,
            room: _room.text.trim().isEmpty ? null : _room.text.trim(),
            teacherUid: _isBreak ? null : _teacherUid,
            teacherName:
                _isBreak || _teacherUid != null || _teacher.text.trim().isEmpty
                ? null
                : _teacher.text.trim(),
          );
      ref.invalidate(timetableProvider(_classId));
      ref.invalidate(timetableProvider(null));
      ref.invalidate(myTimetableProvider);
      if (mounted) Navigator.of(context).pop();
    } on DioException catch (e) {
      setState(() {
        _saving = false;
        _error = e.response?.statusCode == 409
            ? 'Sobrepõe-se a outro tempo desta turma.'
            : 'Não foi possível guardar. Tente de novo.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final subjectsAsync = ref.watch(subjectsProvider(_classId));
    final inset = MediaQuery.of(context).viewInsets.bottom;

    InputDecoration deco(String label) => InputDecoration(
      labelText: label,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    );

    return Padding(
      padding: EdgeInsets.fromLTRB(24, 0, 24, 24 + inset),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Novo tempo',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w600,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              initialValue: _classId,
              decoration: deco('Turma'),
              items: [
                for (final c in widget.classes)
                  DropdownMenuItem(value: c.id, child: Text(c.className)),
              ],
              onChanged: (v) => setState(() {
                _classId = v!;
                _subjectId = null;
              }),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<int>(
              initialValue: _weekday,
              decoration: deco('Dia'),
              items: [
                for (var d = 1; d <= 7; d++)
                  DropdownMenuItem(value: d, child: Text(weekdayLong[d - 1])),
              ],
              onChanged: (v) => setState(() => _weekday = v!),
            ),
            const SizedBox(height: 12),
            SegmentedButton<bool>(
              segments: const [
                ButtonSegment(value: false, label: Text('Aula')),
                ButtonSegment(value: true, label: Text('Pausa')),
              ],
              selected: {_isBreak},
              onSelectionChanged: (v) => setState(() => _isBreak = v.first),
            ),
            const SizedBox(height: 12),
            if (_isBreak)
              TextField(controller: _title, decoration: deco('Nome da pausa'))
            else
              subjectsAsync.when(
                loading: () => const LinearProgressIndicator(),
                error: (_, _) => Text(
                  'Não foi possível carregar as disciplinas.',
                  style: TextStyle(color: AppColors.error),
                ),
                data: (subjects) => subjects.isEmpty
                    ? Text(
                        'Esta turma ainda não tem disciplinas.',
                        style: TextStyle(color: AppColors.textSecondary),
                      )
                    : DropdownButtonFormField<String>(
                        initialValue: _subjectId,
                        decoration: deco('Disciplina'),
                        items: [
                          for (final s in subjects)
                            DropdownMenuItem(value: s.id, child: Text(s.name)),
                        ],
                        onChanged: (v) => setState(() => _subjectId = v),
                      ),
              ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => _pick(true),
                    child: Text('Início  ${_fmt(_start)}'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => _pick(false),
                    child: Text('Fim  ${_fmt(_end)}'),
                  ),
                ),
              ],
            ),
            if (!_isBreak) ...[
              const SizedBox(height: 12),
              TextField(controller: _room, decoration: deco('Sala (opcional)')),
              const SizedBox(height: 12),
              // Com conta: escolhe-se da lista e o professor vê a aula no
              // seu horário. Sem conta (substituto): escreve-se o nome.
              ...ref
                  .watch(teachersProvider)
                  .maybeWhen(
                    data: (teachers) => [
                      DropdownButtonFormField<String?>(
                        initialValue: _teacherUid,
                        decoration: deco('Professor (opcional)'),
                        items: [
                          const DropdownMenuItem<String?>(
                            value: null,
                            child: Text('Sem conta / escrever nome'),
                          ),
                          for (final t in teachers)
                            DropdownMenuItem<String?>(
                              value: t.uid,
                              child: Text(t.name),
                            ),
                        ],
                        onChanged: (v) => setState(() => _teacherUid = v),
                      ),
                      if (_teacherUid == null) ...[
                        const SizedBox(height: 12),
                        TextField(
                          controller: _teacher,
                          decoration: deco('Nome do professor (opcional)'),
                        ),
                      ],
                    ],
                    orElse: () => [
                      TextField(
                        controller: _teacher,
                        decoration: deco('Professor (opcional)'),
                      ),
                    ],
                  ),
            ],
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: TextStyle(color: AppColors.error)),
            ],
            const SizedBox(height: 20),
            SizedBox(
              height: 52,
              child: ElevatedButton(
                onPressed: _saving ? null : _save,
                child: _saving
                    ? SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: AppColors.onPrimary,
                        ),
                      )
                    : const Text('Guardar'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
