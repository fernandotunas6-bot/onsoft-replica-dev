import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Comunicados marcados como favoritos. A API não guarda favoritos, por isso
/// ficam neste dispositivo.
class FavoriteNoticesNotifier extends Notifier<Set<String>> {
  static const _key = 'favorite_notices';
  static const _storage = FlutterSecureStorage();

  @override
  Set<String> build() {
    _restore();
    return const {};
  }

  Future<void> _restore() async {
    try {
      final raw = await _storage.read(key: _key);
      if (raw == null || raw.isEmpty) return;
      state = {...state, ...raw.split(',').where((s) => s.isNotEmpty)};
    } catch (e) {
      if (kDebugMode) debugPrint('[Favorites] restore failed: $e');
    }
  }

  Future<void> toggle(String noticeId) async {
    final next = {...state};
    if (!next.remove(noticeId)) next.add(noticeId);
    state = next;
    try {
      await _storage.write(key: _key, value: next.join(','));
    } catch (e) {
      if (kDebugMode) debugPrint('[Favorites] save failed: $e');
    }
  }
}

final favoriteNoticesProvider =
    NotifierProvider<FavoriteNoticesNotifier, Set<String>>(
      FavoriteNoticesNotifier.new,
    );
