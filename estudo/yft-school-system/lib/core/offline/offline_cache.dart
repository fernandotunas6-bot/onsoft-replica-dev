import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

/// Funcionar sem rede: a última resposta de cada leitura (GET) fica guardada
/// no telemóvel, por conta e por escola. Sem ligação, a app mostra essa cópia
/// e o aviso «a ver dados de há N horas». Escritas nunca passam por aqui.
///
/// A cópia apaga-se ao sair da conta ([OfflineCache.clear]).

/// Onde as cópias ficam: ficheiros na pasta privada da app; em memória nos
/// testes e na versão web (o navegador não tem pasta privada fiável).
abstract class OfflineStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> clear();
}

class MemoryOfflineStore implements OfflineStore {
  final Map<String, String> _data = {};
  @override
  Future<String?> read(String key) async => _data[key];
  @override
  Future<void> write(String key, String value) async => _data[key] = value;
  @override
  Future<void> clear() async => _data.clear();
}

class FileOfflineStore implements OfflineStore {
  Future<Directory>? _dir;

  Future<Directory> _folder() => _dir ??= () async {
    final base = await getApplicationSupportDirectory();
    return Directory('${base.path}/offline_cache').create(recursive: true);
  }();

  Future<File> _file(String key) async => File(
    '${(await _folder()).path}/${base64Url.encode(utf8.encode(key))}.json',
  );

  @override
  Future<String?> read(String key) async {
    try {
      final f = await _file(key);
      return await f.exists() ? await f.readAsString() : null;
    } catch (_) {
      return null;
    }
  }

  @override
  Future<void> write(String key, String value) async {
    try {
      final f = await _file(key);
      // Escreve ao lado e troca: uma escrita interrompida não estraga a cópia.
      final tmp = File('${f.path}.tmp');
      await tmp.writeAsString(value, flush: true);
      await tmp.rename(f.path);
    } catch (_) {}
  }

  @override
  Future<void> clear() async {
    try {
      final dir = await _folder();
      if (await dir.exists()) await dir.delete(recursive: true);
    } catch (_) {}
    _dir = null;
  }
}

/// Estado mostrado ao utilizador: null com dados frescos; a hora da cópia
/// mais antiga que está no ecrã quando se está sem rede.
final offlineSince = ValueNotifier<DateTime?>(null);

class OfflineCache {
  final OfflineStore store;

  /// Conta e escola actuais: separam as cópias de quem partilha o telemóvel.
  final String? Function() scope;

  OfflineCache(this.store, this.scope);

  static String keyFor(String scope, RequestOptions o) {
    final query = o.queryParameters.entries.toList()
      ..sort((a, b) => a.key.compareTo(b.key));
    final q = query.map((e) => '${e.key}=${e.value}').join('&');
    return '$scope|${o.baseUrl}${o.path}?$q';
  }

  Future<void> save(RequestOptions o, Object? data, {DateTime? now}) async {
    final s = scope();
    if (s == null || data == null) return;
    await store.write(
      keyFor(s, o),
      jsonEncode({
        'at': (now ?? DateTime.now()).toUtc().toIso8601String(),
        'data': data,
      }),
    );
  }

  Future<(Object?, DateTime)?> load(RequestOptions o) async {
    final s = scope();
    if (s == null) return null;
    final raw = await store.read(keyFor(s, o));
    if (raw == null) return null;
    try {
      final j = jsonDecode(raw) as Map<String, dynamic>;
      return (j['data'], DateTime.parse(j['at'] as String).toLocal());
    } catch (_) {
      return null;
    }
  }

  Future<void> clear() async {
    offlineSince.value = null;
    await store.clear();
  }
}

/// Falha de rede (sem resposta do servidor): só nestes casos se usa a cópia.
/// Uma resposta do servidor (401, 403, 500…) nunca é substituída pela cópia.
bool isNetworkFailure(DioException e) =>
    e.response == null &&
    switch (e.type) {
      DioExceptionType.connectionError ||
      DioExceptionType.connectionTimeout ||
      DioExceptionType.receiveTimeout ||
      DioExceptionType.sendTimeout ||
      DioExceptionType.unknown => true,
      _ => false,
    };

/// Interceptor das leituras: guarda cada GET com sucesso; sem rede, responde
/// com a última cópia (marcada em `extra['offlineAt']`).
class OfflineCacheInterceptor extends Interceptor {
  final OfflineCache cache;
  OfflineCacheInterceptor(this.cache);

  static bool _isRead(RequestOptions o) =>
      o.method.toUpperCase() == 'GET' &&
      o.responseType != ResponseType.bytes &&
      o.responseType != ResponseType.stream;

  @override
  void onResponse(Response response, ResponseInterceptorHandler handler) {
    final o = response.requestOptions;
    final ok =
        (response.statusCode ?? 0) >= 200 && (response.statusCode ?? 0) < 300;
    if (_isRead(o) && ok && response.extra['offlineAt'] == null) {
      offlineSince.value = null;
      unawaited(cache.save(o, response.data));
    }
    handler.next(response);
  }

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    final o = err.requestOptions;
    if (_isRead(o) && isNetworkFailure(err)) {
      final hit = await cache.load(o);
      if (hit != null) {
        final (data, at) = hit;
        final shown = offlineSince.value;
        if (shown == null || at.isBefore(shown)) offlineSince.value = at;
        return handler.resolve(
          Response(
            requestOptions: o,
            data: data,
            statusCode: 200,
            extra: {'offlineAt': at},
          ),
        );
      }
    }
    handler.next(err);
  }
}

/// «há 5 min», «há 2 horas», «de ontem», «de 3/11».
String offlineAge(DateTime at, {DateTime? now}) {
  final n = now ?? DateTime.now();
  final d = n.difference(at);
  if (d.inMinutes < 1) return 'de agora';
  if (d.inMinutes < 60) return 'de há ${d.inMinutes} min';
  if (d.inHours < 24) {
    return d.inHours == 1 ? 'de há 1 hora' : 'de há ${d.inHours} horas';
  }
  final day = DateTime(at.year, at.month, at.day);
  final today = DateTime(n.year, n.month, n.day);
  final days = today.difference(day).inDays;
  if (days == 1) return 'de ontem';
  if (days < 7) return 'de há $days dias';
  return 'de ${at.day}/${at.month}';
}

OfflineStore defaultOfflineStore() =>
    kIsWeb ? MemoryOfflineStore() : FileOfflineStore();
