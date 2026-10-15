import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/arrears_student.dart';
import '../models/school_class.dart';
import '../models/student.dart';
import '../models/subject.dart';
import '../models/teacher_profile.dart';
import '../models/teacher_summary.dart';
import '../models/timetable_slot.dart';
import '../models/user_profile.dart';
import '../models/paginated_response.dart';
import '../network/api_client.dart';
import '../repositories/class_repository.dart';
import '../repositories/finance_repository.dart';
import '../repositories/grades_repository.dart';
import '../repositories/media_repository.dart';
import '../repositories/notices_repository.dart';
import '../repositories/settings_repository.dart';
import '../repositories/student_repository.dart';
import '../repositories/subject_repository.dart';
import '../repositories/timetable_repository.dart';
import '../repositories/user_repository.dart';

// ── Repository providers ──

final classRepositoryProvider = Provider<ClassRepository>((ref) {
  return ClassRepository(ref.watch(dioProvider));
});

final subjectRepositoryProvider = Provider<SubjectRepository>((ref) {
  return SubjectRepository(ref.watch(dioProvider));
});

final studentRepositoryProvider = Provider<StudentRepository>((ref) {
  return StudentRepository(ref.watch(dioProvider));
});

final financeRepositoryProvider = Provider<FinanceRepository>((ref) {
  return FinanceRepository(ref.watch(dioProvider));
});

final noticesRepositoryProvider = Provider<NoticesRepository>((ref) {
  return NoticesRepository(ref.watch(dioProvider));
});

final userRepositoryProvider = Provider<UserRepository>((ref) {
  return UserRepository(ref.watch(dioProvider));
});

final mediaRepositoryProvider = Provider<MediaRepository>((ref) {
  return MediaRepository(ref.watch(dioProvider));
});

final gradesRepositoryProvider = Provider<GradesRepository>((ref) {
  return GradesRepository(ref.watch(dioProvider));
});

final timetableRepositoryProvider = Provider<TimetableRepository>((ref) {
  return TimetableRepository(ref.watch(dioProvider));
});

final settingsRepositoryProvider = Provider<SettingsRepository>((ref) {
  return SettingsRepository(ref.watch(dioProvider));
});

// ── Data providers ──

final classesProvider = FutureProvider<List<SchoolClass>>((ref) {
  return ref.read(classRepositoryProvider).getClasses();
});

final subjectsProvider = FutureProvider.family<List<Subject>, String?>(
  (ref, classId) {
    return ref.read(subjectRepositoryProvider).getSubjects(classId: classId);
  },
);

final studentsProvider =
    FutureProvider.family<PaginatedResponse<Student>, ({String? classId, int page})>(
  (ref, params) {
    return ref.read(studentRepositoryProvider).getStudents(
          classId: params.classId,
          page: params.page,
        );
  },
);

final studentByIdProvider =
    FutureProvider.family<Student, String>((ref, studentId) {
  return ref.read(studentRepositoryProvider).getStudentById(studentId);
});

final arrearsProvider = FutureProvider<List<ArrearsStudent>>((ref) {
  return ref.read(financeRepositoryProvider).getArrears();
});

final userProfileProvider = FutureProvider<UserProfile>((ref) {
  return ref.read(userRepositoryProvider).getProfile();
});

final teacherProfileProvider =
    FutureProvider.family<TeacherProfile, String>((ref, uid) {
  return ref.read(userRepositoryProvider).getTeacherProfile(uid);
});

/// Horário de uma turma, ou de todas as que o utilizador pode ver (`null`).
final timetableProvider =
    FutureProvider.family<List<TimetableSlot>, String?>((ref, classId) {
  return ref.read(timetableRepositoryProvider).getSlots(classId: classId);
});

/// As aulas do professor autenticado, em todas as turmas.
final myTimetableProvider = FutureProvider<List<TimetableSlot>>((ref) {
  return ref.read(timetableRepositoryProvider).getSlots(mine: true);
});

/// Professores da escola (só o admin pode pedir).
final teachersProvider = FutureProvider<List<TeacherSummary>>((ref) {
  return ref.read(userRepositoryProvider).getTeachers();
});
