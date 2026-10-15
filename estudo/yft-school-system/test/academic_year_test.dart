import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:yft_school_system/core/auth/auth_state.dart';
import 'package:yft_school_system/core/network/api_client.dart';
import 'package:yft_school_system/core/settings/academic_year_state.dart';
import 'package:yft_school_system/demo/demo_api.dart';

class _SignedIn extends AuthStateNotifier {
  @override
  AppSession? build() => AppSession(
    role: UserRole.admin,
    userName: 'Admin',
    schoolId: demoSchoolId,
    uid: 'u1',
  );
}

class _SignedOut extends AuthStateNotifier {
  @override
  AppSession? build() => null;
}

void main() {
  test(
    'com sessão, a moeda e o ano vêm da escola sem abrir o calendário',
    () async {
      final container = ProviderContainer(
        overrides: [
          dioProvider.overrideWithValue(createDemoDio(() => 'admin')),
          authProvider.overrideWith(_SignedIn.new),
        ],
      );
      addTearDown(container.dispose);

      expect(container.read(academicYearProvider).currency, 'GH₵');
      await pumpEventQueue();
      final settings = container.read(academicYearProvider);
      expect(settings.currency, 'Kz');
      expect(settings.academicYear, '2026/2027');
      expect(settings.activeTerm, '1.º Trimestre');
    },
  );

  test(
    'sem sessão, não pede nada à API e fica com os valores por omissão',
    () async {
      var calls = 0;
      final container = ProviderContainer(
        overrides: [
          dioProvider.overrideWithValue(
            createDemoDio(() {
              calls++;
              return 'admin';
            }),
          ),
          authProvider.overrideWith(_SignedOut.new),
        ],
      );
      addTearDown(container.dispose);

      container.read(academicYearProvider);
      await pumpEventQueue();
      expect(calls, 0);
      expect(container.read(academicYearProvider).currency, 'GH₵');
    },
  );
}
