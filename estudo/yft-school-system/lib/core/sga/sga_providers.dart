import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../offline/offline_cache.dart';
import 'sga_auth.dart';
import 'sga_config.dart';

/// A sessão SIGA do aparelho (só usada no modo SIGA). Uma só instância,
/// porque o router (fora do Riverpod) também precisa de saber se há sessão.
final SgaSession appSgaSession = SgaSession(
  SgaAuthClient(SgaConfig.fromEnvironment),
  const SecureSgaTokenStorage(),
)..onClear = () => appOfflineCache.clear();

/// Cópias das leituras para usar sem rede, separadas por conta e escola.
final OfflineCache appOfflineCache = OfflineCache(defaultOfflineStore(), () {
  final t = appSgaSession.tokens;
  if (t == null || t.userId.isEmpty) return null;
  return '${t.userId}|${appSgaSession.schoolId ?? ''}';
});

final sgaSessionProvider = Provider<SgaSession>((ref) => appSgaSession);
