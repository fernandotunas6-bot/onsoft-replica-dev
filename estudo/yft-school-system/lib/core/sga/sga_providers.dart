import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'sga_auth.dart';
import 'sga_config.dart';

/// A sessão SIGA do aparelho (só usada no modo SIGA). Uma só instância,
/// porque o router (fora do Riverpod) também precisa de saber se há sessão.
final appSgaSession = SgaSession(
  SgaAuthClient(SgaConfig.fromEnvironment),
  const SecureSgaTokenStorage(),
);

final sgaSessionProvider = Provider<SgaSession>((ref) => appSgaSession);
