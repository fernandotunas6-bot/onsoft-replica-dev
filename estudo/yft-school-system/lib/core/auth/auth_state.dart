import 'package:dio/dio.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:yft_school_system/core/network/api_client.dart';
import 'package:yft_school_system/core/network/api_endpoints.dart';

enum UserRole { admin, teacher, parent }

class AppSession {
  final UserRole role;
  final String userName;
  final String schoolId;
  final String uid;
  final String? schoolName;
  final String? schoolLogoUrl;
  final String? schoolAddress;
  final String? schoolEmail;
  final String? schoolPhone;
  final String? schoolMotto;
  /// When true, teachers may PUT `/api/grades` for their school.
  final bool teacherCanEditResults;

  AppSession({
    required this.role,
    required this.userName,
    required this.schoolId,
    required this.uid,
    this.schoolName,
    this.schoolLogoUrl,
    this.schoolAddress,
    this.schoolEmail,
    this.schoolPhone,
    this.schoolMotto,
    this.teacherCanEditResults = false,
  });

  AppSession copyWith({
    UserRole? role,
    String? userName,
    String? schoolId,
    String? uid,
    String? schoolName,
    String? schoolLogoUrl,
    String? schoolAddress,
    String? schoolEmail,
    String? schoolPhone,
    String? schoolMotto,
    bool? teacherCanEditResults,
  }) {
    return AppSession(
      role: role ?? this.role,
      userName: userName ?? this.userName,
      schoolId: schoolId ?? this.schoolId,
      uid: uid ?? this.uid,
      schoolName: schoolName ?? this.schoolName,
      schoolLogoUrl: schoolLogoUrl ?? this.schoolLogoUrl,
      schoolAddress: schoolAddress ?? this.schoolAddress,
      schoolEmail: schoolEmail ?? this.schoolEmail,
      schoolPhone: schoolPhone ?? this.schoolPhone,
      schoolMotto: schoolMotto ?? this.schoolMotto,
      teacherCanEditResults:
          teacherCanEditResults ?? this.teacherCanEditResults,
    );
  }
}

UserRole _parseRole(String? roleStr) {
  switch (roleStr) {
    case 'admin':
      return UserRole.admin;
    case 'teacher':
      return UserRole.teacher;
    case 'parent':
      return UserRole.parent;
    default:
      return UserRole.parent;
  }
}

class AuthStateNotifier extends Notifier<AppSession?> {
  @override
  AppSession? build() {
    _tryRestoreSession();
    return null;
  }

  Dio get _dio => ref.read(dioProvider);

  /// Returns [session] and optional HTTP status when the request fails.
  Future<(AppSession?, int?)> _resolveSessionFromApi(User user) async {
    try {
      final response = await _dio.get(ApiEndpoints.usersMe);
      final data = response.data;
      final profile = data is Map<String, dynamic> ? data['data'] : null;
      if (profile is! Map<String, dynamic>) return (null, null);

      final schoolId = profile['school_id'] as String?;
      final role = profile['role'] as String?;
      if (schoolId == null || role == null) return (null, null);

      final tcer = profile['teacher_can_edit_results'];
      final teacherCanEdit = tcer == true ||
          tcer == 1 ||
          tcer == '1' ||
          tcer == 'true';

      final session = AppSession(
        role: _parseRole(role),
        userName: (profile['name'] as String?) ??
            user.displayName ??
            user.email ??
            'User',
        schoolId: schoolId,
        uid: user.uid,
        schoolName: profile['school_name'] as String?,
        schoolLogoUrl: profile['school_logo_url'] as String?,
        schoolAddress: profile['school_address'] as String?,
        schoolEmail: profile['school_email'] as String?,
        schoolPhone: profile['school_phone'] as String?,
        schoolMotto: profile['school_motto'] as String?,
        teacherCanEditResults: teacherCanEdit,
      );
      return (session, null);
    } on DioException catch (e) {
      if (kDebugMode) {
        debugPrint('[Auth] /users/me failed: ${e.response?.statusCode}');
      }
      return (null, e.response?.statusCode);
    }
  }

  Future<void> _tryRestoreSession() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    final (session, _) = await _resolveSessionFromApi(user);
    if (session != null) {
      state = session;
    }
  }

  Future<String?> login(String email, String password) async {
    try {
      final credential = await FirebaseAuth.instance.signInWithEmailAndPassword(
        email: email.trim(),
        password: password,
      );

      final user = credential.user;
      if (user == null) return 'Authentication failed.';

      final (session, meStatus) = await _resolveSessionFromApi(user);
      if (session == null) {
        await FirebaseAuth.instance.signOut();
        if (meStatus == 401) {
          return 'The server could not verify your login. Usually the school API '
              'is set to a different Firebase project than this app. Your developer '
              'should set the worker’s FIREBASE_PROJECT_ID to match the project in '
              'Firebase Console (same as google-services.json).';
        }
        return 'Account not provisioned. Contact your administrator.';
      }

      state = session;
      return null;
    } on FirebaseAuthException catch (e) {
      switch (e.code) {
        case 'user-not-found':
          return 'No account found with this email.';
        case 'wrong-password':
        case 'invalid-credential':
          return 'Invalid email or password.';
        case 'user-disabled':
          return 'This account has been disabled.';
        case 'too-many-requests':
          return 'Too many attempts. Try again later.';
        case 'invalid-email':
          return 'Invalid email address.';
        default:
          return e.message ?? 'Authentication failed.';
      }
    } catch (e) {
      return 'Connection error. Please try again.';
    }
  }

  Future<void> logout() async {
    await FirebaseAuth.instance.signOut();
    state = null;
  }

  /// Reload `/users/me` (e.g. after admin changes access-control flags).
  Future<void> refreshProfile() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;
    final (session, _) = await _resolveSessionFromApi(user);
    if (session != null) {
      state = session;
    }
  }
}

final authProvider = NotifierProvider<AuthStateNotifier, AppSession?>(() {
  return AuthStateNotifier();
});
