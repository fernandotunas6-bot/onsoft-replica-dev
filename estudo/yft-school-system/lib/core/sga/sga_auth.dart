import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'sga_config.dart';

/// Tokens da sessão Supabase. O de acesso dura pouco (1 h); o de renovação
/// troca-se por um novo par.
class SgaTokens {
  final String accessToken;
  final String refreshToken;
  final DateTime expiresAt;
  final String userId;

  const SgaTokens({
    required this.accessToken,
    required this.refreshToken,
    required this.expiresAt,
    required this.userId,
  });

  factory SgaTokens.fromAuthResponse(Map<String, dynamic> j, {DateTime? now}) {
    final expiresIn = (j['expires_in'] as num?)?.toInt() ?? 3600;
    return SgaTokens(
      accessToken: j['access_token'] as String,
      refreshToken: j['refresh_token'] as String,
      expiresAt: (now ?? DateTime.now()).add(Duration(seconds: expiresIn)),
      userId: (j['user'] as Map<String, dynamic>?)?['id'] as String? ?? '',
    );
  }

  Map<String, dynamic> toJson() => {
    'access_token': accessToken,
    'refresh_token': refreshToken,
    'expires_at': expiresAt.toUtc().toIso8601String(),
    'user_id': userId,
  };

  factory SgaTokens.fromJson(Map<String, dynamic> j) => SgaTokens(
    accessToken: j['access_token'] as String,
    refreshToken: j['refresh_token'] as String,
    expiresAt: DateTime.parse(j['expires_at'] as String).toLocal(),
    userId: j['user_id'] as String? ?? '',
  );

  bool expiresWithin(Duration d, {DateTime? now}) =>
      (now ?? DateTime.now()).add(d).isAfter(expiresAt);
}

/// Falha do Auth do SIGA, já com a mensagem para mostrar.
class SgaAuthException implements Exception {
  final String code;
  final String message;
  const SgaAuthException(this.code, this.message);

  @override
  String toString() => 'SgaAuthException($code)';
}

/// Cliente REST do Supabase Auth (GoTrue) do SIGA. Só a chave publicável.
class SgaAuthClient {
  final SgaConfig config;
  final Dio _dio;

  SgaAuthClient(this.config, {Dio? dio})
    : _dio = dio ??
          Dio(BaseOptions(
            connectTimeout: const Duration(seconds: 15),
            receiveTimeout: const Duration(seconds: 15),
          ));

  Options get _options => Options(headers: {
    'apikey': config.publishableKey,
    'Content-Type': 'application/json',
  });

  String _url(String path) => '${config.supabaseUrl.replaceAll(RegExp(r'/+$'), '')}/auth/v1$path';

  Future<SgaTokens> signIn(String email, String password, {String? captchaToken}) =>
      _token('password', {
        'email': email.trim(),
        'password': password,
        if (captchaToken != null && captchaToken.isNotEmpty)
          'gotrue_meta_security': {'captcha_token': captchaToken},
      });

  Future<SgaTokens> refresh(String refreshToken) =>
      _token('refresh_token', {'refresh_token': refreshToken});

  /// Termina a sessão no servidor; falhar aqui não impede sair no aparelho.
  Future<void> signOut(String accessToken) async {
    try {
      await _dio.post(
        _url('/logout'),
        options: _options.copyWith(headers: {
          ..._options.headers!,
          'Authorization': 'Bearer $accessToken',
        }),
      );
    } catch (_) {}
  }

  Future<SgaTokens> _token(String grant, Map<String, dynamic> body) async {
    try {
      final res = await _dio.post(
        _url('/token'),
        queryParameters: {'grant_type': grant},
        data: body,
        options: _options,
      );
      return SgaTokens.fromAuthResponse(res.data as Map<String, dynamic>);
    } on DioException catch (e) {
      throw mapAuthError(e.response?.statusCode, e.response?.data);
    }
  }
}

/// Erros do GoTrue (`error_code`, ou o texto em versões antigas) em português.
SgaAuthException mapAuthError(int? status, Object? data) {
  final map = data is Map ? data : const {};
  final code = (map['error_code'] ?? map['error'] ?? '').toString();
  final text = (map['msg'] ?? map['error_description'] ?? map['message'] ?? '').toString().toLowerCase();
  if (status == null) {
    return const SgaAuthException('network', 'Sem ligação. Tente de novo.');
  }
  if (code == 'captcha_failed' || text.contains('captcha')) {
    return const SgaAuthException('captcha', 'Confirme que não é um robô e tente de novo.');
  }
  if (code == 'invalid_credentials' || text.contains('invalid login credentials')) {
    return const SgaAuthException('credentials', 'E-mail ou palavra-passe incorrectos.');
  }
  if (code == 'email_not_confirmed' || text.contains('email not confirmed')) {
    return const SgaAuthException('unconfirmed', 'Confirme primeiro o e-mail (veja a caixa de correio).');
  }
  if (status == 429 || code.startsWith('over_')) {
    return const SgaAuthException('rate', 'Demasiadas tentativas. Tente mais tarde.');
  }
  if (code == 'refresh_token_not_found' || code == 'refresh_token_already_used' || code == 'session_not_found') {
    return const SgaAuthException('expired', 'A sessão terminou. Entre de novo.');
  }
  return SgaAuthException(code.isEmpty ? 'unknown' : code, 'Não foi possível entrar. Tente de novo.');
}

/// Onde a sessão fica guardada (armazenamento seguro; um falso nos testes).
abstract class SgaTokenStorage {
  Future<String?> read();
  Future<void> write(String value);
  Future<void> delete();
}

class SecureSgaTokenStorage implements SgaTokenStorage {
  static const _key = 'sga_session';
  final FlutterSecureStorage _storage;
  const SecureSgaTokenStorage([this._storage = const FlutterSecureStorage()]);

  @override
  Future<String?> read() => _storage.read(key: _key);
  @override
  Future<void> write(String value) => _storage.write(key: _key, value: value);
  @override
  Future<void> delete() => _storage.delete(key: _key);
}

/// A sessão SIGA do aparelho: dá um token de acesso válido a cada pedido,
/// renovando-o antes de expirar (uma renovação de cada vez).
class SgaSession {
  final SgaAuthClient client;
  final SgaTokenStorage storage;
  SgaTokens? _tokens;
  Future<SgaTokens?>? _refreshing;

  /// Escola escolhida (cabeçalho X-School-Id); null = a primeira do vínculo.
  String? schoolId;

  SgaSession(this.client, this.storage);

  SgaTokens? get tokens => _tokens;
  bool get signedIn => _tokens != null;

  Future<void> signIn(String email, String password, {String? captchaToken}) async {
    _tokens = await client.signIn(email, password, captchaToken: captchaToken);
    await _persist();
  }

  /// Retoma a sessão guardada; false se não houver ou já não for válida.
  Future<bool> restore() async {
    final raw = await storage.read();
    if (raw == null) return false;
    try {
      final j = jsonDecode(raw) as Map<String, dynamic>;
      _tokens = SgaTokens.fromJson(j);
      schoolId = j['school_id'] as String?;
    } catch (_) {
      await clear();
      return false;
    }
    return await accessToken() != null;
  }

  /// Token de acesso válido, ou null se a sessão terminou.
  Future<String?> accessToken() async {
    final t = _tokens;
    if (t == null) return null;
    if (!t.expiresWithin(const Duration(seconds: 60))) return t.accessToken;
    final renewed = await (_refreshing ??= _renew(t).whenComplete(() => _refreshing = null));
    return renewed?.accessToken;
  }

  Future<SgaTokens?> _renew(SgaTokens t) async {
    try {
      _tokens = await client.refresh(t.refreshToken);
      await _persist();
      return _tokens;
    } on SgaAuthException catch (e) {
      // Sem rede, mantém-se a sessão para tentar mais tarde; se o servidor
      // recusou o token de renovação, a sessão acabou.
      if (e.code == 'network') return null;
      await clear();
      return null;
    }
  }

  Future<void> setSchool(String? id) async {
    schoolId = id;
    await _persist();
  }

  Future<void> signOut() async {
    final t = _tokens;
    await clear();
    if (t != null) await client.signOut(t.accessToken);
  }

  Future<void> clear() async {
    _tokens = null;
    schoolId = null;
    await storage.delete();
  }

  Future<void> _persist() async {
    final t = _tokens;
    if (t == null) return;
    await storage.write(jsonEncode({...t.toJson(), 'school_id': schoolId}));
  }
}
