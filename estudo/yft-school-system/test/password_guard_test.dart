import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:yft_school_system/core/auth/auth_state.dart';
import 'package:yft_school_system/core/routing/app_router.dart';

class _Auth extends AuthStateNotifier {
  @override
  AppSession? build() => null;

  void signIn({required bool mustChange}) => state = AppSession(
    role: UserRole.teacher,
    userName: 'p',
    schoolId: 's',
    uid: 'u',
    mustChangePassword: mustChange,
  );
}

void main() {
  group('guarda das rotas', () {
    test('sem sessão: só as páginas públicas', () {
      expect(
        guardRedirect('/login', signedIn: false, mustChangePassword: false),
        isNull,
      );
      expect(
        guardRedirect('/dashboard', signedIn: false, mustChangePassword: false),
        '/login',
      );
    });

    test('com senha temporária: tudo vai para a senha', () {
      for (final route in ['/dashboard', '/finance', '/profile']) {
        expect(
          guardRedirect(route, signedIn: true, mustChangePassword: true),
          '/security-password',
        );
      }
      expect(
        guardRedirect(
          '/security-password',
          signedIn: true,
          mustChangePassword: true,
        ),
        isNull,
      );
      expect(
        guardRedirect('/login', signedIn: true, mustChangePassword: true),
        isNull,
      );
    });

    test('senha já trocada: abre normalmente', () {
      expect(
        guardRedirect('/dashboard', signedIn: true, mustChangePassword: false),
        isNull,
      );
    });
  });

  test(
    'a sessão actualiza a indicação lida pelo router, e o fim da sessão limpa-a',
    () {
      final container = ProviderContainer(
        overrides: [authProvider.overrideWith(_Auth.new)],
      );
      addTearDown(container.dispose);
      final auth = container.read(authProvider.notifier) as _Auth;

      auth.signIn(mustChange: true);
      expect(passwordChangeRequired, isTrue);
      auth.signIn(mustChange: false);
      expect(passwordChangeRequired, isFalse);
      auth.signIn(mustChange: true);
      auth.state = null;
      expect(passwordChangeRequired, isFalse);
    },
  );
}
