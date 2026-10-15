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

  // Grades
  static const grades = '/api/grades';

  // Notices
  static const notices = '/api/notices';
  static const noticesUnreadCount = '/api/notices/unread-count';
  static String noticeMarkRead(String id) => '/api/notices/$id/read';

  // Reports
  static String report(String studentId, String termId) =>
      '/api/reports/$studentId/$termId';

  // Calendar
  static const calendar = '/api/calendar';

  // Parents
  static const parents = '/api/parents';

  // Media (authenticated)
  static const mediaProfilePhoto = '/api/media/profile-photo';

  // Users
  static const usersMe = '/api/users/me';
  static const usersRegisterTeacher = '/api/users/register-teacher';
  static String usersTeacher(String uid) => '/api/users/teachers/$uid';
  static const usersMeAcademicCalendar = '/api/users/me/academic-calendar';
  static const usersMePassword = '/api/users/me/password';
  static const usersMeFcmToken = '/api/users/me/fcm-token';

  // Settings
  static const accessControl = '/api/settings/access-control';

  // Wards (parent)
  static const wards = '/api/wards';
  static String wardProfile(String id) => '/api/wards/$id/profile';
}
