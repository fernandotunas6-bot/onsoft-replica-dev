import 'package:dio/dio.dart';
import '../network/api_endpoints.dart';

class SettingsRepository {
  final Dio _dio;

  SettingsRepository(this._dio);

  Future<void> patchAccessControl({
    required bool teacherCanEditResults,
  }) async {
    await _dio.patch(
      ApiEndpoints.accessControl,
      data: {'teacher_can_edit_results': teacherCanEditResults},
    );
  }
}
