import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/repository_providers.dart' show currentUidProvider;
import 'sga_attendance.dart' show sgaPortalDioProvider;
import 'sga_config.dart';

/// Como está uma disciplina face ao limite de faltas.
enum AbsenceStatus { ok, warning, over, unknown }

AbsenceStatus _status(String? raw) => switch (raw) {
  'ok' => AbsenceStatus.ok,
  'warning' => AbsenceStatus.warning,
  'over' => AbsenceStatus.over,
  _ => AbsenceStatus.unknown,
};

/// As faltas de uma disciplina no ano lectivo (`/api/mobile/absences`).
class SubjectAbsence {
  final String subjectName;
  final int lessons;
  final int absences;
  final int excused;
  final int late;

  /// 0–100; null sem aulas registadas.
  final double? percentage;

  /// Faltas que ainda cabem no limite, sobre as aulas dadas até hoje; null sem
  /// limite. Negativo quando já passou.
  final int? remaining;
  final AbsenceStatus status;

  const SubjectAbsence({
    required this.subjectName,
    required this.lessons,
    required this.absences,
    this.excused = 0,
    this.late = 0,
    this.percentage,
    this.remaining,
    this.status = AbsenceStatus.unknown,
  });

  factory SubjectAbsence.fromJson(Map<String, dynamic> j) => SubjectAbsence(
    subjectName: j['subjectName'] as String? ?? 'Disciplina',
    lessons: (j['lessons'] as num?)?.toInt() ?? 0,
    absences: (j['absences'] as num?)?.toInt() ?? 0,
    excused: (j['excused'] as num?)?.toInt() ?? 0,
    late: (j['late'] as num?)?.toInt() ?? 0,
    percentage: (j['percentage'] as num?)?.toDouble(),
    remaining: (j['remaining'] as num?)?.toInt(),
    status: _status(j['status'] as String?),
  );
}

class StudentAbsences {
  final double? limitPercentage;
  final List<SubjectAbsence> subjects;

  const StudentAbsences({this.limitPercentage, this.subjects = const []});

  List<SubjectAbsence> get atRisk => [
    for (final s in subjects)
      if (s.status == AbsenceStatus.over || s.status == AbsenceStatus.warning)
        s,
  ];

  factory StudentAbsences.fromJson(Map<String, dynamic> j) => StudentAbsences(
    limitPercentage: (j['limitPercentage'] as num?)?.toDouble(),
    subjects: [
      for (final s in (j['subjects'] as List? ?? const []))
        if (s is Map<String, dynamic>) SubjectAbsence.fromJson(s),
    ],
  );
}

/// «12,5 %» (vírgula decimal, como em Angola), sem casas quando é inteiro.
String formatPercent(double value) {
  final rounded = (value * 10).round() / 10;
  final text = rounded == rounded.roundToDouble()
      ? rounded.toStringAsFixed(0)
      : rounded.toStringAsFixed(1).replaceAll('.', ',');
  return '$text %';
}

/// Faltas por disciplina pela rota do portal.
Future<StudentAbsences> fetchSubjectAbsences(
  Dio portal,
  String? studentId,
) async {
  final res = await portal.get(
    '/api/mobile/absences',
    queryParameters: studentId == null ? null : {'student_id': studentId},
  );
  return StudentAbsences.fromJson(res.data as Map<String, dynamic>);
}

/// As faltas por disciplina de um aluno (null = o próprio aluno da conta).
final subjectAbsencesProvider =
    FutureProvider.family<StudentAbsences?, String?>((ref, studentId) async {
      ref.watch(currentUidProvider);
      if (!sgaMode) return null;
      return fetchSubjectAbsences(ref.read(sgaPortalDioProvider), studentId);
    });
