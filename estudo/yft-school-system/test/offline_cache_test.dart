import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:yft_school_system/core/offline/offline_cache.dart';
import 'package:yft_school_system/core/widgets/app_shell.dart';

/// Servidor falso: responde, devolve um erro, ou falha como sem rede.
class _Server implements HttpClientAdapter {
  String mode = 'ok';
  int calls = 0;

  @override
  Future<ResponseBody> fetch(
    RequestOptions o,
    Stream<Uint8List>? s,
    Future<void>? c,
  ) async {
    calls++;
    if (mode == 'offline') {
      throw DioException.connectionError(requestOptions: o, reason: 'sem rede');
    }
    final status = mode == 'error' ? 401 : 200;
    return ResponseBody.fromString(
      jsonEncode({'path': o.path, 'n': calls}),
      status,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  late _Server server;
  late Dio dio;
  late OfflineCache cache;
  String? scope = 'aluno-1|escola-1';

  setUp(() {
    offlineSince.value = null;
    scope = 'aluno-1|escola-1';
    server = _Server();
    cache = OfflineCache(MemoryOfflineStore(), () => scope);
    dio = Dio(BaseOptions(baseUrl: 'https://sga.test'))
      ..httpClientAdapter = server
      ..interceptors.add(OfflineCacheInterceptor(cache));
  });

  Future<void> settle() => Future<void>.delayed(Duration.zero);

  test('sem rede mostra a última cópia e diz de quando é', () async {
    final fresh = await dio.get(
      '/api/sga/grades',
      queryParameters: {'ward': 'a'},
    );
    expect(fresh.data['n'], 1);
    await settle();

    server.mode = 'offline';
    final copy = await dio.get(
      '/api/sga/grades',
      queryParameters: {'ward': 'a'},
    );
    expect(copy.data['n'], 1);
    expect(copy.extra['offlineAt'], isA<DateTime>());
    expect(offlineSince.value, isNotNull);

    // Outro educando nunca recebe a cópia do primeiro.
    await expectLater(
      dio.get('/api/sga/grades', queryParameters: {'ward': 'b'}),
      throwsA(isA<DioException>()),
    );

    server.mode = 'ok';
    await dio.get('/api/sga/grades', queryParameters: {'ward': 'a'});
    expect(offlineSince.value, isNull);
  });

  test('erros do servidor e escritas não usam a cópia', () async {
    await dio.get('/api/sga/me');
    await settle();
    server.mode = 'error';
    await expectLater(dio.get('/api/sga/me'), throwsA(isA<DioException>()));

    server.mode = 'offline';
    await expectLater(dio.post('/api/sga/me'), throwsA(isA<DioException>()));
  });

  test('cópias separadas por conta e apagadas ao sair', () async {
    await dio.get('/api/sga/me');
    await settle();
    server.mode = 'offline';

    scope = 'outra-conta|escola-1';
    await expectLater(dio.get('/api/sga/me'), throwsA(isA<DioException>()));

    scope = 'aluno-1|escola-1';
    expect((await dio.get('/api/sga/me')).data['n'], 1);

    await cache.clear();
    expect(offlineSince.value, isNull);
    await expectLater(dio.get('/api/sga/me'), throwsA(isA<DioException>()));

    scope = null; // sem sessão: nada se guarda nem se lê
    await expectLater(dio.get('/api/sga/me'), throwsA(isA<DioException>()));
  });

  test('idade da cópia', () {
    final now = DateTime(2026, 11, 5, 10);
    expect(offlineAge(now, now: now), 'de agora');
    expect(
      offlineAge(now.subtract(const Duration(minutes: 5)), now: now),
      'de há 5 min',
    );
    expect(
      offlineAge(now.subtract(const Duration(hours: 1)), now: now),
      'de há 1 hora',
    );
    expect(
      offlineAge(now.subtract(const Duration(hours: 2)), now: now),
      'de há 2 horas',
    );
    expect(offlineAge(DateTime(2026, 11, 4, 8), now: now), 'de ontem');
    expect(offlineAge(DateTime(2026, 11, 2, 8), now: now), 'de há 3 dias');
    expect(offlineAge(DateTime(2026, 10, 20), now: now), 'de 20/10');
  });

  testWidgets('a faixa «Sem rede» aparece e some', (tester) async {
    offlineSince.value = null;
    await tester.pumpWidget(
      const MaterialApp(home: OfflineBanner(child: Text('Início'))),
    );
    expect(find.textContaining('Sem rede'), findsNothing);

    offlineSince.value = DateTime.now().subtract(const Duration(hours: 2));
    await tester.pump();
    expect(find.text('Sem rede · a ver dados de há 2 horas'), findsOneWidget);
    expect(find.text('Início'), findsOneWidget);

    offlineSince.value = null;
    await tester.pump();
    expect(find.textContaining('Sem rede'), findsNothing);
  });
}
