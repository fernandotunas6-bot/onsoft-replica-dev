import 'package:dio/dio.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:yft_school_system/core/auth/school_suspension.dart';
import 'package:yft_school_system/core/sga/sga_config.dart';
import 'package:yft_school_system/core/sga/sga_providers.dart';
import 'package:yft_school_system/core/offline/offline_cache.dart';

const _kDefaultBaseUrl = 'https://school-worker.ceo-6f0.workers.dev';

const _kBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: _kDefaultBaseUrl,
);

Dio _createDio(Ref ref) {
  final dio = Dio(
    BaseOptions(
      baseUrl: _kBaseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 15),
      headers: {'Content-Type': 'application/json'},
    ),
  );

  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) async {
        if (sgaMode) {
          // Conta do SIGA: token Supabase (renovado se preciso) e a escola.
          final session = ref.read(sgaSessionProvider);
          final token = await session.accessToken();
          if (token != null) options.headers['Authorization'] = 'Bearer $token';
          final school = session.schoolId;
          if (school != null) options.headers['X-School-Id'] = school;
          return handler.next(options);
        }
        final user = FirebaseAuth.instance.currentUser;
        if (user != null) {
          final token = await user.getIdToken();
          options.headers['Authorization'] = 'Bearer $token';
        }
        return handler.next(options);
      },
      onError: (error, handler) {
        if (kDebugMode) {
          debugPrint(
            '[API] ${error.requestOptions.method} ${error.requestOptions.path} '
            '→ ${error.response?.statusCode}: ${error.response?.data}',
          );
        }

        final data = error.response?.data;
        if (data is Map<String, dynamic>) {
          if (data['code'] == 'school_suspended' &&
              error.response?.statusCode == 403) {
            markSchoolSuspended();
          }
          if (data.containsKey('error')) {
            error = error.copyWith(
              message: data['error'] as String?,
            );
          }
        }

        return handler.next(error);
      },
    ),
  );

  // Sem rede, as leituras do SIGA mostram a última cópia guardada.
  if (sgaMode) dio.interceptors.add(OfflineCacheInterceptor(appOfflineCache));

  return dio;
}

final dioProvider = Provider<Dio>(_createDio);
