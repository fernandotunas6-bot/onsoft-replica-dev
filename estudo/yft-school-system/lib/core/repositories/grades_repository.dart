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
