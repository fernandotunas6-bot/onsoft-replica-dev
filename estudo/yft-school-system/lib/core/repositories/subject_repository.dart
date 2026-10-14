import 'package:dio/dio.dart';
import '../models/subject.dart';
import '../network/api_endpoints.dart';

class SubjectRepository {
  final Dio _dio;

  SubjectRepository(this._dio);

  Future<List<Subject>> getSubjects({String? classId}) async {
    final response = await _dio.get(
      ApiEndpoints.subjects,
      queryParameters: {
        'class_id': ?classId,
      },
    );
    final data = response.data['data'] as List;
    return data
        .map((e) => Subject.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Subject> createSubject({
    required String name,
    required List<String> classIds,
  }) async {
    final response = await _dio.post(
      ApiEndpoints.subjects,
      data: {
        'name': name,
        'class_ids': classIds,
      },
    );
    return Subject.fromJson(response.data as Map<String, dynamic>);
  }

  Future<Subject> updateSubject({
    required String subjectId,
    String? name,
    List<String>? classIds,
  }) async {
    final response = await _dio.patch(
      '${ApiEndpoints.subjects}/$subjectId',
      data: {
        'name': ?name,
        'class_ids': ?classIds,
      },
    );
    return Subject.fromJson(response.data as Map<String, dynamic>);
  }
}
