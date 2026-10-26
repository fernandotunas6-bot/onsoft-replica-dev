import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'sga_attendance.dart' show SgaRejected, sgaPortalDioProvider;

class SgaProfile {
  final String fullName;
  final String? phone;

  /// Versão do perfil: a gravação só passa se ainda for esta.
  final String? updatedAt;
  final String? schoolName;

  const SgaProfile({
    required this.fullName,
    this.phone,
    this.updatedAt,
    this.schoolName,
  });
}

/// O próprio perfil no SIGA (/api/mobile/profile do portal).
class SgaProfileRepository {
  static const _path = '/api/mobile/profile';
  final Dio _portal;
  SgaProfileRepository(this._portal);

  Future<SgaProfile> load() => _guard(() async {
    final res = await _portal.get(_path);
    return SgaProfile(
      fullName: res.data['full_name'] as String? ?? '',
      phone: res.data['phone'] as String?,
      updatedAt: res.data['updated_at'] as String?,
      schoolName: res.data['school_name'] as String?,
    );
  });

  Future<void> save({
    required String fullName,
    required String phone,
    String? expectedUpdatedAt,
  }) => _guard(() async {
    await _portal.post(
      _path,
      data: {
        'full_name': fullName,
        'phone': phone.isEmpty ? null : phone,
        'expected_updated_at': expectedUpdatedAt,
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
        400 || 403 || 409 || 422 when message != null => message,
        422 => 'Verifique o nome e o telefone.',
        null => 'Sem ligação. Tente de novo.',
        _ => 'O SIGA não respondeu. Tente mais tarde.',
      });
    }
  }
}

final sgaProfileRepositoryProvider = Provider<SgaProfileRepository>(
  (ref) => SgaProfileRepository(ref.watch(sgaPortalDioProvider)),
);
