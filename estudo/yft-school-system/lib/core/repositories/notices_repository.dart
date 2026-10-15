import 'package:dio/dio.dart';

import '../models/school_notice.dart';
import '../network/api_endpoints.dart';

class NoticesRepository {
  final Dio _dio;

  NoticesRepository(this._dio);

  Future<List<SchoolNotice>> listNotices() async {
    final response = await _dio.get(ApiEndpoints.notices);
    final list = response.data['data'] as List;
    return list
        .map((e) => SchoolNotice.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<int> getUnreadCount() async {
    final response = await _dio.get(ApiEndpoints.noticesUnreadCount);
    final raw = response.data['unread_count'];
    if (raw is num) return raw.toInt();
    return int.tryParse('$raw') ?? 0;
  }

  /// Publica um comunicado (só admin). [classId] só com audience 'class'.
  Future<void> create({
    required String title,
    required String body,
    required String audience,
    String? classId,
    String category = 'general',
  }) async {
    await _dio.post(
      ApiEndpoints.notices,
      data: {
        'title': title,
        'body': body,
        'audience': audience,
        'class_id': ?classId,
        'category': category,
      },
    );
  }

  Future<void> delete(String noticeId) async {
    await _dio.delete('${ApiEndpoints.notices}/$noticeId');
  }

  Future<void> markRead(String noticeId) async {
    await _dio.post(ApiEndpoints.noticeMarkRead(noticeId));
  }
}
