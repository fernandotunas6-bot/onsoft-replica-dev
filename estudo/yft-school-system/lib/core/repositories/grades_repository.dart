import 'package:dio/dio.dart';
import '../network/api_endpoints.dart';
import '../sga/sga_config.dart';

class SubjectGradeScores {
  final double classScore;
  final double examScore;

  const SubjectGradeScores({
    required this.classScore,
    required this.examScore,
  });
}

class GradeUpsertRow {
  final String subjectId;
  final double classScore;
  final double examScore;

  const GradeUpsertRow({
    required this.subjectId,
    required this.classScore,
    required this.examScore,
  });
}

/// Notas de um trimestre no modelo angolano do SIGA (escala 0–20).
class AngolaScores {
  final double? mac;
  final double? npp;
  final double? npt;

  /// Média trimestral: (MAC + NPT) / 2, calculada no servidor como no SIGA.
  final double? mt;

  /// O diário ainda não fechou: a nota pode mudar.
  final bool provisional;

  const AngolaScores({this.mac, this.npp, this.npt, this.mt, this.provisional = false});
}

/// Uma linha do boletim: a disciplina e as duas notas (0–30 e 0–70) ou, no
/// modo SIGA, as notas angolanas em [angola].
class ReportLine {
  final String subjectId;
  final String subjectName;
  final double classScore;
  final double examScore;
  final AngolaScores? angola;

  const ReportLine({
    required this.subjectId,
    required this.subjectName,
    required this.classScore,
    required this.examScore,
    this.angola,
  });

  double get total => classScore + examScore;

  /// A nota a mostrar: o total (0–100) ou a MT (0–20); null sem notas.
  double? get score => angola == null ? total : angola!.mt;
}

/// Boletim de um período: o ano lectivo a que se refere e as linhas.
class ReportCard {
  final String academicYear;
  final List<ReportLine> lines;

  /// Nota máxima: 100 (contínua + exame) ou 20 (modelo angolano do SIGA).
  final int scale;

  const ReportCard(this.academicYear, this.lines, {this.scale = 100});
}

class GradesRepository {
  final Dio _dio;

  GradesRepository(this._dio);

  Future<Map<String, SubjectGradeScores>> getGradesForStudent({
    required String studentId,
    required String term,
    String? academicYear,
  }) async {
    final response = await _dio.get(
      ApiEndpoints.grades,
      queryParameters: {
        'student_id': studentId,
        'term': term,
        'academic_year': ?academicYear,
      },
    );
    final list = response.data['data'] as List<dynamic>;
    final out = <String, SubjectGradeScores>{};
    for (final raw in list) {
      final row = raw as Map<String, dynamic>;
      final sid = row['subject_id'] as String;
      out[sid] = SubjectGradeScores(
        classScore: (row['class_score'] as num?)?.toDouble() ?? 0,
        examScore: (row['exam_score'] as num?)?.toDouble() ?? 0,
      );
    }
    return out;
  }

  /// Notas de um aluno num período, com o nome de cada disciplina.
  Future<ReportCard> getReportCard({
    required String studentId,
    required String term,
    String? academicYear,
  }) async {
    if (sgaMode) {
      final res = await _dio.get(
        ApiEndpoints.sgaGrades,
        queryParameters: {
          'student_id': studentId,
          'term': term,
          'academic_year': ?academicYear,
        },
      );
      double? n(Object? v) => (v as num?)?.toDouble();
      return ReportCard(
        res.data['academic_year'] as String? ?? '',
        [
          for (final raw in (res.data['data'] as List).cast<Map<String, dynamic>>())
            ReportLine(
              subjectId: raw['subject_id'] as String,
              subjectName: raw['subject_name'] as String? ?? '—',
              classScore: 0,
              examScore: 0,
              angola: AngolaScores(
                mac: n(raw['mac']),
                npp: n(raw['npp']),
                npt: n(raw['npt']),
                mt: n(raw['mt']),
                provisional: raw['provisional'] == true,
              ),
            ),
        ],
        scale: (res.data['scale'] as num?)?.toInt() ?? 20,
      );
    }
    final response = await _dio.get(
      ApiEndpoints.grades,
      queryParameters: {
        'student_id': studentId,
        'term': term,
        'academic_year': ?academicYear,
      },
    );
    final list = response.data['data'] as List<dynamic>;
    return ReportCard(response.data['academic_year'] as String? ?? '', [
      for (final raw in list.cast<Map<String, dynamic>>())
        ReportLine(
          subjectId: raw['subject_id'] as String,
          subjectName: raw['subject_name'] as String? ?? '—',
          classScore: (raw['class_score'] as num?)?.toDouble() ?? 0,
          examScore: (raw['exam_score'] as num?)?.toDouble() ?? 0,
        ),
    ]);
  }

  /// Anos com notas deste aluno, mais o actual (mais recente primeiro).
  Future<({List<String> years, String current})> getYears(String studentId) async {
    final res = await _dio.get(
      sgaMode ? ApiEndpoints.sgaGradeYears : '${ApiEndpoints.grades}/years',
      queryParameters: {'student_id': studentId},
    );
    return (
      years: (res.data['data'] as List).cast<String>(),
      current: res.data['current'] as String? ?? '',
    );
  }

  Future<void> saveGrades({
    required String studentId,
    required String term,
    String? academicYear,
    required List<GradeUpsertRow> grades,
  }) async {
    await _dio.put(
      ApiEndpoints.grades,
      data: {
        'student_id': studentId,
        'term': term,
        'academic_year': ?academicYear,
        'grades': grades
            .map(
              (g) => {
                'subject_id': g.subjectId,
                'class_score': g.classScore,
                'exam_score': g.examScore,
              },
            )
            .toList(),
      },
    );
  }
}
