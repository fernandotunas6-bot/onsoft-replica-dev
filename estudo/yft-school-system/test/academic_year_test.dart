import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:yft_school_system/core/auth/auth_state.dart';
import 'package:yft_school_system/core/network/api_client.dart';
import 'package:yft_school_system/core/settings/academic_year_state.dart';

/// Responde só a GET /api/users/me/academic-calendar, com o formato do Worker.
Dio _calendarApi(List<String> paths) {
  final dio = Dio(BaseOptions(baseUrl: 'https://api.invalid'));
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) {
        paths.add(options.path);
        handler.resolve(
          Response(
            requestOptions: options,
            statusCode: 200,
            data: {
              'data': {
                'academic_year': '2026/2027',
                'active_term': 'Term 1',
                'currency': 'Kz',
                'term_system': 3,
                'terms': <Object>[],
              },
            },
          ),
        );
      },
    ),
  );
  return dio;
}

class _SignedIn extends AuthStateNotifier {
  @override
  AppSession? build() =>
      AppSession(role: UserRole.admin, userName: 'a', schoolId: 's', uid: 'u');
}

class _SignedOut extends AuthStateNotifier {
  @override
  AppSession? build() => null;
}

void main() {
  test(
    'com sessão, a moeda e o ano vêm da escola sem abrir o calendário',
    () async {
      final paths = <String>[];
      final container = ProviderContainer(
        overrides: [
          dioProvider.overrideWithValue(_calendarApi(paths)),
          authProvider.overrideWith(_SignedIn.new),
        ],
      );
      addTearDown(container.dispose);

      expect(container.read(academicYearProvider).currency, 'GH₵');
      await pumpEventQueue();
      final settings = container.read(academicYearProvider);
      expect(paths, ['/api/users/me/academic-calendar']);
      expect(settings.currency, 'Kz');
      expect(settings.academicYear, '2026/2027');
    },
  );

  test('sem sessão, não pede nada à API', () async {
    final paths = <String>[];
    final container = ProviderContainer(
      overrides: [
        dioProvider.overrideWithValue(_calendarApi(paths)),
        authProvider.overrideWith(_SignedOut.new),
      ],
    );
    addTearDown(container.dispose);

    container.read(academicYearProvider);
    await pumpEventQueue();
    expect(paths, isEmpty);
  });
}
