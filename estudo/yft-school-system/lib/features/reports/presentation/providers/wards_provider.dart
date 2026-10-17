import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:yft_school_system/core/models/student.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';

final wardsProvider = FutureProvider<List<Student>>((ref) async {
  final studentRepo = ref.watch(studentRepositoryProvider);
  return await studentRepo.getWards();
});
