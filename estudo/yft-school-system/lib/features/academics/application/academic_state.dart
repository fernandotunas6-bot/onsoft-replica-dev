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

final assignedClassesProvider = FutureProvider<List<SchoolClass>>((ref) {
  return ref.read(classRepositoryProvider).getClasses();
});
