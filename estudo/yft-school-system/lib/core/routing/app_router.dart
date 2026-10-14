import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:yft_school_system/core/models/school_class.dart';
import 'package:yft_school_system/core/models/student.dart';
import 'package:yft_school_system/features/auth/presentation/forgot_password_screen.dart';
import 'package:yft_school_system/features/auth/presentation/login_screen.dart';
import 'package:yft_school_system/features/dashboard/presentation/dashboard_screen.dart';
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

final rootNavigatorKey = GlobalKey<NavigatorState>();

final appRouter = GoRouter(
  navigatorKey: rootNavigatorKey,
  initialLocation: '/',
  routes: [
    GoRoute(path: '/', builder: (context, state) => const SplashScreen()),
    GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
    GoRoute(
      path: '/forgot-password',
      builder: (context, state) => const ForgotPasswordScreen(),
    ),
    GoRoute(
      path: '/dashboard',
      builder: (context, state) => const DashboardScreen(),
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
      builder: (context, state) => const AttendanceScreen(),
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
      builder: (context, state) => const ResultCardScreen(),
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
      builder: (context, state) => const ResultsSetupScreen(),
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
