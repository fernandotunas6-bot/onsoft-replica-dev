import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:yft_school_system/core/models/school_class.dart';
import 'package:yft_school_system/core/models/student.dart';
import 'package:yft_school_system/features/auth/presentation/forgot_password_screen.dart';
import 'package:yft_school_system/features/auth/presentation/login_screen.dart';
import 'package:yft_school_system/features/dashboard/presentation/dashboard_screen.dart';
import 'package:yft_school_system/features/onboarding/presentation/onboarding_screen.dart';
import 'package:yft_school_system/features/splash/presentation/splash_screen.dart';
import 'package:yft_school_system/features/staff/presentation/teacher_registration_screen.dart';
import 'package:yft_school_system/features/staff/presentation/student_details_screen.dart';
import 'package:yft_school_system/features/staff/presentation/teacher_details_screen.dart';
import 'package:yft_school_system/features/staff/presentation/student_directory_screen.dart';
import 'package:yft_school_system/features/dashboard/presentation/create_notice_screen.dart';
import 'package:yft_school_system/features/staff/presentation/teacher_list_screen.dart';
import 'package:yft_school_system/features/staff/presentation/student_admission_screen.dart';
import 'package:yft_school_system/features/profile/presentation/profile_screen.dart';
import 'package:yft_school_system/features/academics/presentation/class_list_screen.dart';
import 'package:yft_school_system/features/academics/presentation/subject_list_screen.dart';
import 'package:yft_school_system/features/finance/presentation/finance_overview_screen.dart';
import 'package:yft_school_system/features/grading/presentation/attendance_screen.dart';
import 'package:yft_school_system/features/staff/presentation/my_classes_screen.dart';
import 'package:yft_school_system/features/staff/presentation/admin_student_classes_screen.dart';
import 'package:yft_school_system/features/staff/presentation/admin_class_students_screen.dart';
import 'package:yft_school_system/features/staff/presentation/teacher_student_search_screen.dart';
import 'package:yft_school_system/features/staff/presentation/student_detail_view.dart';
import 'package:yft_school_system/features/reports/presentation/ward_profile_screen.dart';
import 'package:yft_school_system/features/reports/presentation/parent_wards_screen.dart';
import 'package:yft_school_system/features/reports/presentation/result_card_screen.dart';
import 'package:yft_school_system/features/reports/presentation/ward_attendance_screen.dart';
import 'package:yft_school_system/features/finance/presentation/payment_history_screen.dart';
import 'package:yft_school_system/features/dashboard/presentation/notices_screen.dart';
import 'package:yft_school_system/features/academics/presentation/class_setup_screen.dart';
import 'package:yft_school_system/features/academics/presentation/academic_calendar_screen.dart';
import 'package:yft_school_system/features/grading/presentation/results_setup_screen.dart';
import 'package:yft_school_system/features/grading/presentation/results_input_screen.dart';
import 'package:yft_school_system/features/profile/presentation/personal_info_screen.dart';
import 'package:yft_school_system/features/profile/presentation/security_settings_screen.dart';
import 'package:yft_school_system/features/profile/presentation/notification_settings_screen.dart';
import 'package:yft_school_system/features/profile/presentation/privacy_policy_screen.dart';
import 'package:yft_school_system/features/profile/presentation/help_support_screen.dart';
import 'package:yft_school_system/features/finance/presentation/students_finance_list_screen.dart';
import 'package:yft_school_system/features/finance/presentation/log_payment_screen.dart';
import 'package:yft_school_system/features/grading/presentation/total_attendance_screen.dart';

import 'package:yft_school_system/features/finance/presentation/parent_receipts_screen.dart';
import 'package:yft_school_system/features/calendar/presentation/calendar_screen.dart';
import 'package:yft_school_system/features/messages/presentation/conversations.dart';
import 'package:yft_school_system/features/messages/presentation/messages_screen.dart';
import 'package:yft_school_system/features/profile/presentation/appearance_screen.dart';
import 'package:yft_school_system/features/subjects/presentation/subjects_screen.dart';
import 'package:yft_school_system/core/sga/sga_config.dart';
import 'package:yft_school_system/core/sga/sga_providers.dart';
import 'package:yft_school_system/features/grading/presentation/sga_attendance_screen.dart';
import 'package:yft_school_system/features/grading/presentation/sga_grades_screen.dart';

final rootNavigatorKey = GlobalKey<NavigatorState>();

final appRouter = GoRouter(
  navigatorKey: rootNavigatorKey,
  initialLocation: '/',
  // Sem sessão Firebase, só as páginas públicas abrem; o resto vai ao login.
  redirect: (context, state) {
    const public = {
      '/',
      '/bem-vindo',
      '/login',
      '/forgot-password',
      '/help-support',
    };
    if (public.contains(state.matchedLocation)) return null;
    try {
      final signedIn = sgaMode
          ? appSgaSession.signedIn
          : FirebaseAuth.instance.currentUser != null;
      return signedIn ? null : '/login';
    } catch (_) {
      return '/login'; // Firebase não inicializado
    }
  },
  routes: [
    GoRoute(path: '/', builder: (context, state) => const SplashScreen()),
    GoRoute(
      path: '/bem-vindo',
      builder: (context, state) => const OnboardingScreen(),
    ),
    GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
    GoRoute(
      path: '/forgot-password',
      builder: (context, state) => const ForgotPasswordScreen(),
    ),
    GoRoute(
      path: '/dashboard',
      builder: (context, state) => const DashboardScreen(),
    ),
    // Separadores da barra inferior.
    GoRoute(
      path: '/disciplinas',
      builder: (context, state) => const SubjectsScreen(),
    ),
    GoRoute(
      path: '/calendario',
      builder: (context, state) => const CalendarScreen(),
    ),
    GoRoute(
      path: '/mensagens',
      builder: (context, state) => const MessagesScreen(),
    ),
    GoRoute(
      path: '/conversa/:id',
      builder: (context, state) =>
          ChatScreen(conversationId: state.pathParameters['id']!),
    ),
    GoRoute(
      path: '/aparencia',
      builder: (context, state) => const AppearanceScreen(),
    ),
    GoRoute(
      path: '/register-teacher',
      builder: (context, state) =>
          TeacherRegistrationScreen(teacherId: state.uri.queryParameters['id']),
    ),
    GoRoute(
      path: '/teachers',
      builder: (context, state) => const TeacherListScreen(),
    ),
    GoRoute(
      path: '/admission',
      builder: (context, state) =>
          StudentAdmissionScreen(studentId: state.uri.queryParameters['id']),
    ),
    GoRoute(
      path: '/profile',
      builder: (context, state) => const ProfileScreen(),
    ),
    GoRoute(
      path: '/classes',
      builder: (context, state) => const ClassListScreen(),
    ),
    GoRoute(
      path: '/subjects',
      builder: (context, state) => const SubjectListScreen(),
    ),
    GoRoute(
      path: '/finance',
      builder: (context, state) => const FinanceOverviewScreen(),
    ),
    GoRoute(
      path: '/attendance',
      // Modo SIGA: a chamada por aula do SIGA (rotas /api/mobile do portal).
      builder: (context, state) =>
          sgaMode ? const SgaAttendanceScreen() : const AttendanceScreen(),
    ),

    GoRoute(
      path: '/my-classes',
      builder: (context, state) => const MyClassesScreen(),
    ),
    GoRoute(
      path: '/student-search',
      builder: (context, state) => const TeacherStudentSearchScreen(),
    ),
    GoRoute(
      path: '/student-detail',
      builder: (context, state) => const StudentDetailView(),
    ),
    GoRoute(
      path: '/ward-profile',
      builder: (context, state) {
        final extra = state.extra;
        if (extra is Student) {
          return WardProfileScreen(ward: extra);
        }
        return const WardProfileScreen();
      },
    ),
    GoRoute(
      path: '/result-card',
      builder: (context, state) => ResultCardScreen(
        initialWardId: state.extra is String ? state.extra as String : null,
      ),
    ),
    GoRoute(
      path: '/payment-history',
      builder: (context, state) => const PaymentHistoryScreen(),
    ),
    GoRoute(
      path: '/notices',
      builder: (context, state) => const NoticesScreen(),
    ),
    GoRoute(
      path: '/admin-student-classes',
      builder: (context, state) => const AdminStudentClassesScreen(),
    ),
    GoRoute(
      path: '/admin-class-students',
      builder: (context, state) => const AdminClassStudentsScreen(),
    ),
    GoRoute(
      path: '/wards',
      builder: (context, state) => const ParentWardsScreen(),
    ),
    GoRoute(
      path: '/class-setup',
      builder: (context, state) {
        final extra = state.extra;
        if (extra is SchoolClass) {
          return ClassSetupScreen(schoolClass: extra);
        }
        return const ClassSetupScreen();
      },
    ),
    GoRoute(
      path: '/academic-calendar',
      builder: (context, state) => const AcademicCalendarScreen(),
    ),
    GoRoute(
      path: '/results-setup',
      // Modo SIGA: lançamento MAC/NPP/NPT por turma e disciplina (no SIGA).
      builder: (context, state) =>
          sgaMode ? const SgaGradesScreen() : const ResultsSetupScreen(),
    ),
    GoRoute(
      path: '/results-input',
      builder: (context, state) {
        final extra = state.extra as Map<String, dynamic>?;
        return ResultsInputScreen(extraArgs: extra);
      },
    ),
    GoRoute(
      path: '/personal-info',
      builder: (context, state) => const PersonalInfoScreen(),
    ),
    GoRoute(
      path: '/security-password',
      builder: (context, state) => const SecuritySettingsScreen(),
    ),
    GoRoute(
      path: '/notifications-settings',
      builder: (context, state) => const NotificationSettingsScreen(),
    ),
    GoRoute(
      path: '/privacy-policy',
      builder: (context, state) => const PrivacyPolicyScreen(),
    ),
    GoRoute(
      path: '/help-support',
      builder: (context, state) => const HelpSupportScreen(),
    ),
    GoRoute(
      path: '/students-finance',
      builder: (context, state) => const StudentsFinanceListScreen(),
    ),
    GoRoute(
      path: '/log-payment',
      builder: (context, state) {
        final id = state.uri.queryParameters['student'];
        return LogPaymentScreen(initialStudentId: id);
      },
    ),
    GoRoute(
      path: '/ward-attendance',
      builder: (context, state) => WardAttendanceScreen(
        initialWardId: state.extra is String ? state.extra as String : null,
      ),
    ),
    GoRoute(
      path: '/total-attendance',
      builder: (context, state) => const TotalAttendanceScreen(),
    ),
    GoRoute(
      path: '/parent-receipts',
      builder: (context, state) => const ParentReceiptsScreen(),
    ),
    GoRoute(
      path: '/student-directory',
      builder: (context, state) => const StudentDirectoryScreen(),
    ),
    GoRoute(
      path: '/student-details/:id',
      builder: (context, state) =>
          StudentDetailsScreen(id: state.pathParameters['id']!),
    ),
    GoRoute(
      path: '/teacher-details/:id',
      builder: (context, state) =>
          TeacherDetailsScreen(id: state.pathParameters['id']!),
    ),
    GoRoute(
      path: '/create-notice',
      builder: (context, state) => const CreateNoticeScreen(),
    ),
  ],
);
