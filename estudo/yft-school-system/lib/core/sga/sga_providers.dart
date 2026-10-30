import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../notify/background_notify.dart';
import '../notify/phone_notifications.dart';
import '../offline/offline_cache.dart';
import 'sga_auth.dart';
import 'sga_config.dart';

/// A sessão SIGA do aparelho (só usada no modo SIGA). Uma só instância,
/// porque o router (fora do Riverpod) também precisa de saber se há sessão.
final SgaSession appSgaSession = SgaSession(
  SgaAuthClient(SgaConfig.fromEnvironment),
  const SecureSgaTokenStorage(),
)..onClear = _forgetDevice;

/// Sessão terminada: nada da conta fica no telemóvel — cópias para usar sem
/// rede, notificações à vista e a verificação em segundo plano.
Future<void> _forgetDevice() async {
  await appOfflineCache.clear();
  await PhoneNotifications.instance.clearAll();
  await BackgroundNotify.cancel();
}

/// Cópias das leituras para usar sem rede, separadas por conta e escola.
final OfflineCache appOfflineCache = OfflineCache(defaultOfflineStore(), () {
  final t = appSgaSession.tokens;
  if (t == null || t.userId.isEmpty) return null;
  return '${t.userId}|${appSgaSession.schoolId ?? ''}';
});

final sgaSessionProvider = Provider<SgaSession>((ref) => appSgaSession);
