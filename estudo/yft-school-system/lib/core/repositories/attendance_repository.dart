import 'package:dio/dio.dart';

import '../network/api_endpoints.dart';
import '../sga/sga_config.dart';

/// Um aluno na lista de presenças de um dia. [present] é null por marcar.
class AttendanceEntry {
  final String studentId;
  final String name;
  final String? photoUrl;
  final bool? present;

  const AttendanceEntry({
    required this.studentId,
    required this.name,
    this.photoUrl,
    this.present,
  });
}

class AttendanceRoster {
  final List<AttendanceEntry> entries;

  /// O dia já tinha sido marcado (gravar agora corrige).
  final bool marked;

  const AttendanceRoster(this.entries, this.marked);
}

class AttendanceTotals {
  final String studentId;
  final String name;
  final int presentDays;
  final int absentDays;

  const AttendanceTotals({
    required this.studentId,
    required this.name,
    required this.presentDays,
    required this.absentDays,
  });
}

class AttendanceSummary {
  final List<AttendanceTotals> students;
  final int daysMarked;

  const AttendanceSummary(this.students, this.daysMarked);
}

class StudentAttendance {
  final int presentDays;
  final int absentDays;

  /// Datas das faltas mais recentes, "YYYY-MM-DD", da mais nova para a mais antiga.
  final List<String> absences;

  const StudentAttendance(this.presentDays, this.absentDays, this.absences);
}

String isoDay(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

class AttendanceRepository {
  final Dio _dio;

  AttendanceRepository(this._dio);

  Future<AttendanceRoster> getRoster(String classId, DateTime date) async {
    final res = await _dio.get(
      ApiEndpoints.attendance,
      queryParameters: {'class_id': classId, 'date': isoDay(date)},
    );
    final list = (res.data['data'] as List).cast<Map<String, dynamic>>();
    return AttendanceRoster([
      for (final r in list)
        AttendanceEntry(
          studentId: r['student_id'] as String,
          name: r['name'] as String,
          photoUrl: r['photo_url'] as String?,
          present: r['present'] as bool?,
        ),
    ], res.data['marked'] == true);
  }

  Future<void> save(
    String classId,
    DateTime date,
    Map<String, bool> presentByStudent,
  ) async {
    await _dio.put(
      ApiEndpoints.attendance,
      data: {
        'class_id': classId,
        'date': isoDay(date),
        'records': [
          for (final e in presentByStudent.entries)
            {'student_id': e.key, 'present': e.value},
        ],
      },
    );
  }

  Future<AttendanceSummary> summary(String classId) async {
    final res = await _dio.get(
      ApiEndpoints.attendanceSummary,
      queryParameters: {'class_id': classId},
    );
    final list = (res.data['data'] as List).cast<Map<String, dynamic>>();
    return AttendanceSummary([
      for (final r in list)
        AttendanceTotals(
          studentId: r['student_id'] as String,
          name: r['name'] as String,
          presentDays: (r['present_days'] as num).toInt(),
          absentDays: (r['absent_days'] as num).toInt(),
        ),
    ], (res.data['days_marked'] as num?)?.toInt() ?? 0);
  }

  Future<StudentAttendance> forStudent(String studentId) async {
    final res = await _dio.get(
      sgaMode
          ? ApiEndpoints.sgaAttendanceStudent(studentId)
          : ApiEndpoints.attendanceStudent(studentId),
    );
    return StudentAttendance(
      (res.data['present_days'] as num).toInt(),
      (res.data['absent_days'] as num).toInt(),
      (res.data['absences'] as List).cast<String>(),
    );
  }
}
