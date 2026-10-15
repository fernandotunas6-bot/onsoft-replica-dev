// Demonstração para estudo: os ecrãs reais com dados fictícios, sem Firebase
// nem API. Entrar com qualquer senha e um destes e-mails:
//   admin@demo.ao · professor@demo.ao · encarregado@demo.ao
// Compilar: flutter build web -t lib/main_demo.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:yft_school_system/app_root.dart';
import 'package:yft_school_system/core/auth/auth_state.dart';
import 'package:yft_school_system/core/network/api_client.dart';
import 'package:yft_school_system/core/routing/app_router.dart';
import 'package:yft_school_system/demo/demo_api.dart';

String _role = 'admin';
bool _signedIn = false;

class DemoAuthNotifier extends AuthStateNotifier {
  @override
  AppSession? build() => null;

  @override
  Future<String?> login(String email, String password) async {
    final e = email.trim().toLowerCase();
    _role = e.startsWith('prof')
        ? 'teacher'
        : e.startsWith('enc')
        ? 'parent'
        : 'admin';
    final p = demoProfile(_role);
    _signedIn = true;
    state = AppSession(
      role: UserRole.values.byName(_role),
      userName: p['name'] as String,
      schoolId: demoSchoolId,
      uid: p['uid'] as String,
      schoolName: p['school_name'] as String,
      schoolAddress: p['school_address'] as String,
      schoolMotto: p['school_motto'] as String,
      teacherCanEditResults: true,
    );
    return null;
  }

  @override
  Future<void> logout() async {
    _signedIn = false;
    state = null;
  }

  @override
  Future<void> refreshProfile() async {}
}

void main() {
  hasSession = () => _signedIn;
  runApp(
    ProviderScope(
      overrides: [
        dioProvider.overrideWithValue(createDemoDio(() => _role)),
        authProvider.overrideWith(DemoAuthNotifier.new),
      ],
      child: const Directionality(
        textDirection: TextDirection.ltr,
        child: Banner(
          message: 'DEMO',
          location: BannerLocation.topEnd,
          child: AppRoot(),
        ),
      ),
    ),
  );
}
