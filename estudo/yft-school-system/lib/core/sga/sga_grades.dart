import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../network/api_client.dart';
import 'sga_attendance.dart' show SgaRejected, sgaPortalDioProvider;

/// Uma disciplina que o professor dá numa turma.
class SgaAssignment {
  final String classGroupId;
  final String className;
  final String subjectId;
  final String subjectName;

  const SgaAssignment(
    this.classGroupId,
    this.className,
    this.subjectId,
    this.subjectName,
  );

  factory SgaAssignment.fromJson(Map<String, dynamic> j) => SgaAssignment(
    j['class_group_id'] as String,
    j['class_name'] as String? ?? 'Turma',
    j['subject_id'] as String,
    j['subject_name'] as String? ?? 'Disciplina',
  );

  String get key => '$classGroupId|$subjectId';
}

/// As notas de um aluno num trimestre (escala 0–20).
class SgaStudentGrades {
  final String enrollmentId;
  final String name;
  final String? photoUrl;
  final double? mac;
  final double? npp;
  final double? npt;

  const SgaStudentGrades({
    required this.enrollmentId,
    required this.name,
    this.photoUrl,
    this.mac,
    this.npp,
    this.npt,
  });

  factory SgaStudentGrades.fromJson(Map<String, dynamic> j) => SgaStudentGrades(
    enrollmentId: j['enrollment_id'] as String,
    name: j['name'] as String? ?? 'Aluno',
    photoUrl: j['photo_url'] as String?,
    mac: (j['mac'] as num?)?.toDouble(),
    npp: (j['npp'] as num?)?.toDouble(),
    npt: (j['npt'] as num?)?.toDouble(),
  );
}

class SgaGradeSheet {
  final bool provisional;
  final List<SgaStudentGrades> students;
  const SgaGradeSheet(this.provisional, this.students);
}

/// Uma linha a gravar: as três notas.
typedef SgaGradeRow = ({
  String enrollmentId,
  double mac,
  double npp,
  double npt,
});

/// MT = (MAC + NPT) / 2 à décima; só com uma das duas, vale essa (como o SIGA).
double? trimesterAverage(double? mac, double? npt) {
  double r(double v) => (v * 10 + 1e-9).round() / 10;
  if (mac != null && npt != null) return r((mac + npt) / 2);
  return mac ?? npt;
}

/// Leituras no Worker (/api/sga/teacher/*); a gravação vai para o SIGA
/// (/api/mobile/grades), que aplica as regras e a auditoria do SIGA.
class SgaGradesRepository {
  final Dio _worker;
  final Dio _portal;
  SgaGradesRepository(this._worker, this._portal);

  Future<List<SgaAssignment>> assignments() => _guard(() async {
    final res = await _worker.get('/api/sga/teacher/classes');
    return [
      for (final j in (res.data['data'] as List).cast<Map<String, dynamic>>())
        SgaAssignment.fromJson(j),
    ];
  });

  Future<SgaGradeSheet> sheet(SgaAssignment a, int term) => _guard(() async {
    final res = await _worker.get(
      '/api/sga/teacher/grades',
      queryParameters: {
        'class_group_id': a.classGroupId,
        'subject_id': a.subjectId,
        'term': term,
      },
    );
    return SgaGradeSheet(res.data['provisional'] != false, [
      for (final j
          in (res.data['students'] as List).cast<Map<String, dynamic>>())
        SgaStudentGrades.fromJson(j),
    ]);
  });

  /// Grava em lotes de 80 (o máximo do SIGA por pedido).
  Future<void> save(String subjectId, int term, List<SgaGradeRow> rows) =>
      _guard(() async {
        for (var i = 0; i < rows.length; i += 80) {
          final chunk = rows.sublist(
            i,
            i + 80 > rows.length ? rows.length : i + 80,
          );
          await _portal.post(
            '/api/mobile/grades',
            data: {
              'subject_id': subjectId,
              'term': term,
              'rows': [
                for (final r in chunk)
                  {
                    'enrollment_id': r.enrollmentId,
                    'mac': r.mac,
                    'npp': r.npp,
                    'npt': r.npt,
                  },
              ],
            },
          );
        }
      });

  Future<T> _guard<T>(Future<T> Function() run) async {
    try {
      return await run();
    } on DioException catch (e) {
      final data = e.response?.data;
      final message = data is Map ? data['message'] as String? : null;
      throw SgaRejected(switch (e.response?.statusCode) {
        401 => 'A sessão terminou. Entre de novo.',
        400 || 403 || 409 when message != null => message,
        403 => 'Esta conta não pode lançar notas.',
        404 => 'Esta disciplina não é sua nesta turma.',
        422 => 'Verifique as notas: têm de estar entre 0 e 20.',
        null => 'Sem ligação. Tente de novo.',
        _ => 'O SIGA não respondeu. Tente mais tarde.',
      });
    }
  }
}

final sgaGradesRepositoryProvider = Provider<SgaGradesRepository>(
  (ref) => SgaGradesRepository(
    ref.watch(dioProvider),
    ref.watch(sgaPortalDioProvider),
  ),
);
