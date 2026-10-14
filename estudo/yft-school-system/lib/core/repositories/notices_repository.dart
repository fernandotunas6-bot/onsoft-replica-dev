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

  Future<void> markRead(String noticeId) async {
    await _dio.post(ApiEndpoints.noticeMarkRead(noticeId));
  }
}
