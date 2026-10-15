import 'package:dio/dio.dart';

import '../models/timetable_slot.dart';
import '../network/api_endpoints.dart';

class TimetableRepository {
  final Dio _dio;

  TimetableRepository(this._dio);

  /// [mine]: só as aulas do professor autenticado, em todas as turmas.
  Future<List<TimetableSlot>> getSlots({String? classId, bool mine = false}) async {
    final response = await _dio.get(
      ApiEndpoints.timetable,
      queryParameters: {'class_id': ?classId, if (mine) 'mine': '1'},
    );
    final list = response.data['data'] as List;
    return list
        .map((e) => TimetableSlot.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<void> createSlot({
    required String classId,
    String? subjectId,
    String? title,
    required int weekday,
    required String startTime,
    required String endTime,
    String? room,
    String? teacherName,
    String? teacherUid,
  }) async {
    await _dio.post(
      ApiEndpoints.timetable,
      data: {
        'class_id': classId,
        'subject_id': ?subjectId,
        'title': ?title,
        'weekday': weekday,
        'start_time': startTime,
        'end_time': endTime,
        'room': ?room,
        'teacher_name': ?teacherName,
        'teacher_uid': ?teacherUid,
      },
    );
  }

  Future<void> deleteSlot(String id) async {
    await _dio.delete(ApiEndpoints.timetableSlot(id));
  }
}
