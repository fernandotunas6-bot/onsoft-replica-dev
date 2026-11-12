import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:yft_school_system/core/auth/auth_state.dart';
import 'package:yft_school_system/core/models/school_class.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';

class SelectedClassNotifier extends Notifier<SchoolClass?> {
  @override
  SchoolClass? build() => null;

  void selectClass(SchoolClass cls) {
    state = cls;
  }
}

final selectedClassProvider =
    NotifierProvider<SelectedClassNotifier, SchoolClass?>(() {
  return SelectedClassNotifier();
});


/// Turmas onde o professor autenticado tem aulas no horário (vazio se o
/// horário ainda não o tem, se falhar, ou se não for professor: para a
/// direcção, `?mine=1` devolve o horário de toda a escola).
final teacherClassIdsProvider = FutureProvider<Set<String>>((ref) async {
  ref.watch(currentUidProvider);
  final role = ref.watch(authProvider.select((s) => s?.role));
  if (role != UserRole.teacher) return const {};
  try {
    final slots = await ref.watch(myTimetableProvider.future);
    return {for (final s in slots) s.classId};
  } catch (_) {
    return const {};
  }
});
