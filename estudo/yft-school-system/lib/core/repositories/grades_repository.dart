import 'package:dio/dio.dart';
import '../network/api_endpoints.dart';

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

/// Uma linha do boletim: a disciplina e as duas notas (0–30 e 0–70).
class ReportLine {
  final String subjectId;
  final String subjectName;
  final double classScore;
  final double examScore;

  const ReportLine({
    required this.subjectId,
    required this.subjectName,
    required this.classScore,
    required this.examScore,
  });

  double get total => classScore + examScore;
}

class GradesRepository {
  final Dio _dio;

  GradesRepository(this._dio);

  Future<Map<String, SubjectGradeScores>> getGradesForStudent({
    required String studentId,
    required String term,
  }) async {
    final response = await _dio.get(
      ApiEndpoints.grades,
      queryParameters: {
        'student_id': studentId,
        'term': term,
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
  Future<List<ReportLine>> getReportCard({
    required String studentId,
    required String term,
  }) async {
    final response = await _dio.get(
      ApiEndpoints.grades,
      queryParameters: {'student_id': studentId, 'term': term},
    );
    final list = response.data['data'] as List<dynamic>;
    return [
      for (final raw in list.cast<Map<String, dynamic>>())
        ReportLine(
          subjectId: raw['subject_id'] as String,
          subjectName: raw['subject_name'] as String? ?? '—',
          classScore: (raw['class_score'] as num?)?.toDouble() ?? 0,
          examScore: (raw['exam_score'] as num?)?.toDouble() ?? 0,
        ),
    ];
  }

  Future<void> saveGrades({
    required String studentId,
    required String term,
    required List<GradeUpsertRow> grades,
  }) async {
    await _dio.put(
      ApiEndpoints.grades,
      data: {
        'student_id': studentId,
        'term': term,
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
