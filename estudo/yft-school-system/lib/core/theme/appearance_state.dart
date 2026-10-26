import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'app_colors.dart';

enum AppThemeMode { system, light, dark }

/// Preferências do ecrã Aparência. Ficam só neste dispositivo.
class AppearanceSettings {
  final AppThemeMode themeMode;
  final String accentId;
  final String backdropId;
  final bool reduceMotion;
  final bool modernIcons;

  const AppearanceSettings({
    this.themeMode = AppThemeMode.system,
    this.accentId = 'blue',
    this.backdropId = 'aurora',
    this.reduceMotion = false,
    this.modernIcons = true,
  });

  AccentOption get accent => AppColors.accentById(accentId);
  BackdropOption get backdrop => AppColors.backdropById(backdropId);

  AppearanceSettings copyWith({
    AppThemeMode? themeMode,
    String? accentId,
    String? backdropId,
    bool? reduceMotion,
    bool? modernIcons,
  }) {
    return AppearanceSettings(
      themeMode: themeMode ?? this.themeMode,
      accentId: accentId ?? this.accentId,
      backdropId: backdropId ?? this.backdropId,
      reduceMotion: reduceMotion ?? this.reduceMotion,
      modernIcons: modernIcons ?? this.modernIcons,
    );
  }

  Map<String, String> toStorage() => {
    'themeMode': themeMode.name,
    'accentId': accentId,
    'backdropId': backdropId,
    'reduceMotion': '$reduceMotion',
    'modernIcons': '$modernIcons',
  };

  factory AppearanceSettings.fromStorage(Map<String, String> raw) {
    return AppearanceSettings(
      themeMode: AppThemeMode.values.firstWhere(
        (m) => m.name == raw['themeMode'],
        orElse: () => AppThemeMode.system,
      ),
      accentId: raw['accentId'] ?? 'blue',
      backdropId: raw['backdropId'] ?? 'aurora',
      reduceMotion: raw['reduceMotion'] == 'true',
      modernIcons: raw['modernIcons'] != 'false',
    );
  }
}

class AppearanceNotifier extends Notifier<AppearanceSettings> {
  static const _prefix = 'appearance.';
  static const _storage = FlutterSecureStorage();

  @override
  AppearanceSettings build() {
    _restore();
    return const AppearanceSettings();
  }

  Future<void> _restore() async {
    try {
      final all = await _storage.readAll();
      final mine = <String, String>{
        for (final e in all.entries)
          if (e.key.startsWith(_prefix)) e.key.substring(_prefix.length): e.value,
      };
      if (mine.isNotEmpty) state = AppearanceSettings.fromStorage(mine);
    } catch (e) {
      if (kDebugMode) debugPrint('[Appearance] restore failed: $e');
    }
  }

  Future<void> _save(AppearanceSettings next) async {
    state = next;
    try {
      for (final e in next.toStorage().entries) {
        await _storage.write(key: '$_prefix${e.key}', value: e.value);
      }
    } catch (e) {
      if (kDebugMode) debugPrint('[Appearance] save failed: $e');
    }
  }

  void setThemeMode(AppThemeMode mode) => _save(state.copyWith(themeMode: mode));
  void setAccent(String id) => _save(state.copyWith(accentId: id));
  void setBackdrop(String id) => _save(state.copyWith(backdropId: id));
  void setReduceMotion(bool v) => _save(state.copyWith(reduceMotion: v));
  void setModernIcons(bool v) => _save(state.copyWith(modernIcons: v));

  /// Atalho do menu lateral: liga ou desliga o escuro, sem passar por Sistema.
  void setDark(bool dark) =>
      setThemeMode(dark ? AppThemeMode.dark : AppThemeMode.light);
}

final appearanceProvider =
    NotifierProvider<AppearanceNotifier, AppearanceSettings>(
      AppearanceNotifier.new,
    );
