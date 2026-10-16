import 'package:flutter_riverpod/flutter_riverpod.dart';
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
/// horário ainda não o tem ou se falhar).
final teacherClassIdsProvider = FutureProvider<Set<String>>((ref) async {
  ref.watch(currentUidProvider);
  try {
    final slots = await ref.watch(myTimetableProvider.future);
    return {for (final s in slots) s.classId};
  } catch (_) {
    return const {};
  }
});
