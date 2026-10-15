import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/auth_state.dart';

/// School flag from `/api/users/me` (`teacher_can_edit_results`).
/// Admins can change it in Security settings (persisted on the Worker).
final teacherCanEditResultsProvider = Provider<bool>((ref) {
  final session = ref.watch(authProvider);
  return session?.teacherCanEditResults ?? false;
});
