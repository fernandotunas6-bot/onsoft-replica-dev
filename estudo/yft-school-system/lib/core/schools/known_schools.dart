import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../auth/auth_state.dart';

/// Uma escola onde este dispositivo já entrou.
///
/// A API não publica a lista de escolas — a escola vem da conta, em
/// `/users/me`. O selector do login mostra por isso só as escolas que este
/// aparelho já conhece, gravadas depois de cada entrada bem-sucedida.
class KnownSchool {
  final String id;
  final String name;
  final String? address;
  final String? logoKey;
  final String role;

  const KnownSchool({
    required this.id,
    required this.name,
    this.address,
    this.logoKey,
    required this.role,
  });

  factory KnownSchool.fromSession(AppSession s) => KnownSchool(
    id: s.schoolId,
    name: (s.schoolName?.trim().isNotEmpty ?? false) ? s.schoolName! : 'Escola',
    address: s.schoolAddress,
    logoKey: s.schoolLogoUrl,
    role: s.role.name,
  );

  factory KnownSchool.fromJson(Map<String, dynamic> j) => KnownSchool(
    id: j['id'] as String,
    name: j['name'] as String,
    address: j['address'] as String?,
    logoKey: j['logo'] as String?,
    role: j['role'] as String? ?? 'parent',
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'address': address,
    'logo': logoKey,
    'role': role,
  };

  String get roleLabel => switch (role) {
    'admin' => 'Administração',
    'teacher' => 'Professor',
    _ => 'Encarregado de educação',
  };
}

class KnownSchoolsNotifier extends Notifier<List<KnownSchool>> {
  static const _key = 'known_schools';
  static const _storage = FlutterSecureStorage();

  @override
  List<KnownSchool> build() {
    _restore();
    // Cada sessão nova acrescenta a sua escola à lista.
    ref.listen<AppSession?>(authProvider, (_, next) {
      if (next != null) remember(KnownSchool.fromSession(next));
    });
    return const [];
  }

  Future<void> _restore() async {
    try {
      final raw = await _storage.read(key: _key);
      if (raw == null || raw.isEmpty) return;
      final list = (jsonDecode(raw) as List)
          .map((e) => KnownSchool.fromJson(e as Map<String, dynamic>))
          .toList();
      // Uma sessão restaurada pode ter chegado primeiro: juntar, não substituir.
      state = [
        ...state,
        ...list.where((k) => !state.any((s) => s.id == k.id)),
      ];
    } catch (e) {
      if (kDebugMode) debugPrint('[KnownSchools] restore failed: $e');
    }
  }

  Future<void> remember(KnownSchool school) async {
    state = [school, ...state.where((s) => s.id != school.id)];
    try {
      await _storage.write(
        key: _key,
        value: jsonEncode(state.map((s) => s.toJson()).toList()),
      );
    } catch (e) {
      if (kDebugMode) debugPrint('[KnownSchools] save failed: $e');
    }
  }
}

final knownSchoolsProvider =
    NotifierProvider<KnownSchoolsNotifier, List<KnownSchool>>(
      KnownSchoolsNotifier.new,
    );
