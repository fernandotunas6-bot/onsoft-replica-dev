import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'sga_config.dart';
import 'sga_providers.dart';

/// Uma aula do dia (sessão de chamada do SIGA).
class SgaLesson {
  final String id;
  final String className;
  final String subjectName;
  final String startsAt;
  final String endsAt;
  final String? room;

  /// pending | completed | cancelled
  final String status;

  const SgaLesson({
    required this.id,
    required this.className,
    required this.subjectName,
    required this.startsAt,
    required this.endsAt,
    this.room,
    required this.status,
  });

  factory SgaLesson.fromJson(Map<String, dynamic> j) => SgaLesson(
    id: j['id'] as String,
    className: j['class_group_name'] as String? ?? 'Turma',
    subjectName: j['subject_name'] as String? ?? 'Disciplina',
    startsAt: (j['starts_at'] as String? ?? '')
        .padRight(5)
        .substring(0, 5)
        .trim(),
    endsAt: (j['ends_at'] as String? ?? '').padRight(5).substring(0, 5).trim(),
    room: j['room'] as String?,
    status: j['status'] as String? ?? 'pending',
  );

  bool get done => status == 'completed';
}

/// Um aluno na folha de chamada, com o estado do SIGA.
class SgaCallStudent {
  final String studentId;
  final String name;
  final String? photoUrl;

  /// present | absent | late | excused | early_exit | not_registered
  final String status;

  const SgaCallStudent({
    required this.studentId,
    required this.name,
    this.photoUrl,
    required this.status,
  });

  factory SgaCallStudent.fromJson(Map<String, dynamic> j) => SgaCallStudent(
    studentId: j['student_id'] as String,
    name: j['full_name'] as String? ?? 'Aluno',
    photoUrl: j['photo_url'] as String?,
    status: j['status'] as String? ?? 'not_registered',
  );
}

class SgaCallSheet {
  final SgaLesson lesson;
  final List<SgaCallStudent> students;
  const SgaCallSheet(this.lesson, this.students);
}

/// Recusa do SIGA, com o texto para mostrar.
class SgaRejected implements Exception {
  final String message;
  const SgaRejected(this.message);
  @override
  String toString() => message;
}

/// Chamada do professor nas rotas `/api/mobile/attendance` do SIGA.
class SgaAttendanceRepository {
  final Dio _dio;
  SgaAttendanceRepository(this._dio);

  Future<({String date, List<SgaLesson> lessons})> lessons(String date) =>
      _guard(() async {
        final res = await _dio.get(
          '/api/mobile/attendance',
          queryParameters: {'date': date},
        );
        return (
          date: res.data['date'] as String? ?? date,
          lessons: [
            for (final s
                in (res.data['sessions'] as List? ?? const [])
                    .cast<Map<String, dynamic>>())
              SgaLesson.fromJson(s),
          ],
        );
      });

  Future<SgaCallSheet> sheet(String sessionId) => _guard(() async {
    final res = await _dio.get(
      '/api/mobile/attendance',
      queryParameters: {'session_id': sessionId},
    );
    final session = res.data['session'] as Map<String, dynamic>;
    return SgaCallSheet(
      SgaLesson.fromJson({
        ...session,
        'class_group_name': session['class_group_name'],
        'subject_name': session['subject_name'],
      }),
      [
        for (final s
            in (res.data['students'] as List? ?? const [])
                .cast<Map<String, dynamic>>())
          SgaCallStudent.fromJson(s),
      ],
    );
  });

  /// Grava e fecha a chamada; com [reason], corrige uma já fechada (fica na
  /// auditoria do SIGA).
  Future<void> save(
    String sessionId,
    Map<String, String> statuses, {
    String? reason,
  }) => _guard(() async {
    await _dio.post(
      '/api/mobile/attendance',
      data: {
        'session_id': sessionId,
        'records': [
          for (final e in statuses.entries)
            {'student_id': e.key, 'status': e.value},
        ],
        'reason': ?reason,
      },
    );
  });

  Future<T> _guard<T>(Future<T> Function() run) async {
    try {
      return await run();
    } on DioException catch (e) {
      final data = e.response?.data;
      final message = data is Map ? data['message'] as String? : null;
      throw SgaRejected(switch (e.response?.statusCode) {
        401 => 'A sessão terminou. Entre de novo.',
        400 || 403 || 409 when message != null => message,
        422 => 'Pedido inválido. Actualize e tente de novo.',
        null => 'Sem ligação. Tente de novo.',
        _ => 'O SIGA não respondeu. Tente mais tarde.',
      });
    }
  }
}

/// Dio para o portal do SIGA, com o token da sessão SIGA.
final sgaPortalDioProvider = Provider<Dio>((ref) {
  final dio = Dio(
    BaseOptions(
      baseUrl: SgaConfig.fromEnvironment.portalUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 20),
      headers: {'Content-Type': 'application/json'},
    ),
  );
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await ref.read(sgaSessionProvider).accessToken();
        if (token != null) options.headers['Authorization'] = 'Bearer $token';
        handler.next(options);
      },
    ),
  );
  return dio;
});

final sgaAttendanceRepositoryProvider = Provider<SgaAttendanceRepository>(
  (ref) => SgaAttendanceRepository(ref.watch(sgaPortalDioProvider)),
);
