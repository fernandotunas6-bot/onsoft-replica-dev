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
import '../repositories/attendance_repository.dart';
import '../repositories/class_repository.dart';
import '../repositories/conversations_repository.dart';
import '../repositories/finance_repository.dart';
import '../repositories/grades_repository.dart';
import '../repositories/media_repository.dart';
import '../repositories/notices_repository.dart';
import '../repositories/settings_repository.dart';
import '../repositories/student_repository.dart';
import '../repositories/subject_repository.dart';
import '../repositories/timetable_repository.dart';
import '../repositories/user_repository.dart';
import '../auth/auth_state.dart';
import 'package:yft_school_system/core/sga/sga_config.dart';

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

final attendanceRepositoryProvider = Provider<AttendanceRepository>((ref) {
  return AttendanceRepository(ref.watch(dioProvider));
});

final conversationsRepositoryProvider = Provider<ConversationsRepository>((ref) {
  return ConversationsRepository(ref.watch(dioProvider));
});

final settingsRepositoryProvider = Provider<SettingsRepository>((ref) {
  return SettingsRepository(ref.watch(dioProvider));
});

// ── Data providers ──

/// O uid da sessão. Os providers de dados observam-no: ao sair e entrar com
/// outra conta no mesmo aparelho, recarregam em vez de mostrarem os dados da
/// pessoa anterior.
final currentUidProvider = Provider<String?>((ref) {
  return ref.watch(authProvider.select((s) => s?.uid));
});

final classesProvider = FutureProvider<List<SchoolClass>>((ref) {
  ref.watch(currentUidProvider);
  return ref.read(classRepositoryProvider).getClasses();
});

final subjectsProvider = FutureProvider.family<List<Subject>, String?>(
  (ref, classId) {
    ref.watch(currentUidProvider);
  ref.watch(currentUidProvider);
    return ref.read(subjectRepositoryProvider).getSubjects(classId: classId);
  },
);

final studentsProvider =
    FutureProvider.family<PaginatedResponse<Student>, ({String? classId, int page})>(
  (ref, params) {
    ref.watch(currentUidProvider);
  ref.watch(currentUidProvider);
    return ref.read(studentRepositoryProvider).getStudents(
          classId: params.classId,
          page: params.page,
        );
  },
);

final studentByIdProvider =
    FutureProvider.family<Student, String>((ref, studentId) {
  ref.watch(currentUidProvider);
  return ref.read(studentRepositoryProvider).getStudentById(studentId);
});

final arrearsProvider = FutureProvider<List<ArrearsStudent>>((ref) {
  ref.watch(currentUidProvider);
  return ref.read(financeRepositoryProvider).getArrears();
});

final userProfileProvider = FutureProvider<UserProfile>((ref) {
  ref.watch(currentUidProvider);
  return ref.read(userRepositoryProvider).getProfile();
});

final teacherProfileProvider =
    FutureProvider.family<TeacherProfile, String>((ref, uid) {
  ref.watch(currentUidProvider);
  return ref.read(userRepositoryProvider).getTeacherProfile(uid);
});

/// Horário de uma turma, ou de todas as que o utilizador pode ver (`null`).
final timetableProvider =
    FutureProvider.family<List<TimetableSlot>, String?>((ref, classId) {
  ref.watch(currentUidProvider);
  return ref.read(timetableRepositoryProvider).getSlots(classId: classId);
});

/// As aulas do professor autenticado, em todas as turmas.
final myTimetableProvider = FutureProvider<List<TimetableSlot>>((ref) {
  ref.watch(currentUidProvider);
  return ref.read(timetableRepositoryProvider).getSlots(mine: true);
});

/// Professores da escola (só o admin pode pedir).
final teachersProvider = FutureProvider<List<TeacherSummary>>((ref) {
  ref.watch(currentUidProvider);
  return ref.read(userRepositoryProvider).getTeachers();
});

/// Boletim de um aluno num período ("Term 1"…).
final reportCardProvider = FutureProvider.family<ReportCard,
    ({String studentId, String term, String? year})>((ref, args) {
  ref.watch(currentUidProvider);
  return ref.read(gradesRepositoryProvider).getReportCard(
    studentId: args.studentId,
    term: args.term,
    academicYear: args.year,
  );
});

/// Anos lectivos com notas de um aluno, mais o actual.
final gradeYearsProvider = FutureProvider.family<
    ({List<String> years, String current}), String>((ref, studentId) {
  ref.watch(currentUidProvider);
  return ref.read(gradesRepositoryProvider).getYears(studentId);
});

/// Lista de presenças de uma turma num dia.
final attendanceRosterProvider = FutureProvider.family<AttendanceRoster,
    ({String classId, String day})>((ref, a) {
  ref.watch(currentUidProvider);
  return ref
      .read(attendanceRepositoryProvider)
      .getRoster(a.classId, DateTime.parse(a.day));
});

final attendanceSummaryProvider =
    FutureProvider.family<AttendanceSummary, String>((ref, classId) {
  ref.watch(currentUidProvider);
  return ref.read(attendanceRepositoryProvider).summary(classId);
});

final studentAttendanceProvider =
    FutureProvider.family<StudentAttendance, String>((ref, studentId) {
  ref.watch(currentUidProvider);
  return ref.read(attendanceRepositoryProvider).forStudent(studentId);
});

final conversationsProvider = FutureProvider<List<ConversationSummary>>((ref) {
  ref.watch(currentUidProvider);
  // Modo SIGA: as conversas ainda não passaram para o SIGA (fase 4).
  if (sgaMode) return const <ConversationSummary>[];
  return ref.read(conversationsRepositoryProvider).list();
});

final conversationsUnreadProvider = FutureProvider<int>((ref) {
  ref.watch(currentUidProvider);
  if (sgaMode) return 0;
  return ref.read(conversationsRepositoryProvider).unreadCount();
});

final chatContactsProvider = FutureProvider<List<ChatContact>>((ref) {
  ref.watch(currentUidProvider);
  return ref.read(conversationsRepositoryProvider).contacts();
});

final chatThreadProvider =
    FutureProvider.autoDispose.family<ChatThread, String>((ref, id) {
  ref.watch(currentUidProvider);
  return ref.read(conversationsRepositoryProvider).thread(id);
});
