import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:yft_school_system/core/models/school_notice.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';

final parentNoticesProvider = FutureProvider<List<SchoolNotice>>((ref) {
  return ref.read(noticesRepositoryProvider).listNotices();
});

final unreadNoticesCountProvider = FutureProvider<int>((ref) {
  return ref.read(noticesRepositoryProvider).getUnreadCount();
});
