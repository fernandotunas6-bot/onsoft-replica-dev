class ApiEndpoints {
  // Classes
  static const classes = '/api/classes';

  // Subjects
  static const subjects = '/api/subjects';

  // Students
  static const students = '/api/students';
  static String studentById(String id) => '/api/students/$id';

  // Teachers
  static const teachers = '/api/teachers';
  static String teacherById(String id) => '/api/teachers/$id';

  // Finance
  static const financeArrears = '/api/finance/arrears';
  static const financeStudents = '/api/finance/students';
  static const financePayment = '/api/finance/payment';
  static const financeChargeClass = '/api/finance/charge-class';
  static const financeAdjustClassFee = '/api/finance/adjust-class-fee';
  static String financeStudentTransactions(String id) =>
      '/api/finance/student/$id/transactions';
  static const financeReceipts = '/api/finance/receipts';

  // Attendance
  static const attendance = '/api/attendance';
  static const attendanceSummary = '/api/attendance/summary';
  static String attendanceStudent(String id) => '/api/attendance/student/$id';

  // Grades
  static const grades = '/api/grades';

  // Notices
  static const notices = '/api/notices';
  static const noticesUnreadCount = '/api/notices/unread-count';
  static String noticeMarkRead(String id) => '/api/notices/$id/read';

  // Reports
  static String report(String studentId, String termId) =>
      '/api/reports/$studentId/$termId';

  // Timetable (horário semanal)
  static const timetable = '/api/timetable';
  static String timetableSlot(String id) => '/api/timetable/$id';

  // Calendar
  static const calendar = '/api/calendar';

  // Parents
  static const parents = '/api/parents';

  // Media (authenticated)
  static const mediaProfilePhoto = '/api/media/profile-photo';

  // Users
  static const usersMe = '/api/users/me';
  static const usersRegisterTeacher = '/api/users/register-teacher';
  static const usersTeachers = '/api/users/teachers';
  static String usersTeacher(String uid) => '/api/users/teachers/$uid';
  static const usersMeAcademicCalendar = '/api/users/me/academic-calendar';
  static const usersMePassword = '/api/users/me/password';
  static const usersMeFcmToken = '/api/users/me/fcm-token';

  // Settings
  static const accessControl = '/api/settings/access-control';

  // Wards (parent)
  static const wards = '/api/wards';

  // Modo SIGA (conta e dados do Supabase do SIGA): ver core/sga.
  static const sgaMe = '/api/sga/me';
  static const sgaWards = '/api/sga/wards';
  static const sgaNotices = '/api/sga/notices';
  static const sgaTimetable = '/api/sga/timetable';
  static const sgaReceipts = '/api/sga/finance/receipts';
  static const sgaGrades = '/api/sga/grades';
  static const sgaSubjects = '/api/sga/subjects';
  static const sgaClasses = '/api/sga/classes';
  static const sgaAcademicCalendar = '/api/sga/academic-calendar';
  static const sgaGradeYears = '/api/sga/grades/years';
  static String sgaAttendanceStudent(String id) => '/api/sga/attendance/student/$id';
  static const sgaAttendanceSummary = '/api/sga/attendance/summary';
  static String wardProfile(String id) => '/api/wards/$id/profile';
}
