import 'package:dio/dio.dart';
import '../models/school_class.dart';
import '../network/api_endpoints.dart';

class ClassRepository {
  final Dio _dio;

  ClassRepository(this._dio);

  Future<List<SchoolClass>> getClasses() async {
    final response = await _dio.get(ApiEndpoints.classes);
    final data = response.data['data'] as List;
    return data
        .map((e) => SchoolClass.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<SchoolClass> createClass({
    required String className,
    int? level,
  }) async {
    final response = await _dio.post(
      ApiEndpoints.classes,
      data: {
        'class_name': className,
        'level': ?level,
      },
    );
    return SchoolClass.fromJson(response.data as Map<String, dynamic>);
  }

  Future<void> updateClass({
    required String classId,
    required String className,
    int? level,
    double? feeAmount,
    String? feeCollectionCycle,
  }) async {
    await _dio.patch(
      '${ApiEndpoints.classes}/$classId',
      data: {
        'class_name': className,
        'level': ?level,
        'fee_amount': ?feeAmount,
        'fee_collection_cycle': ?feeCollectionCycle,
      },
    );
  }

  Future<void> deleteClass(String classId) async {
    await _dio.delete('${ApiEndpoints.classes}/$classId');
  }
}
