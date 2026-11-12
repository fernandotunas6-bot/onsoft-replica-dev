import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:yft_school_system/core/notify/background_notify.dart';
import 'package:yft_school_system/core/notify/notify_planner.dart';
import 'package:yft_school_system/core/notify/notify_state.dart';

/// Portal e Worker falsos: respondem por caminho e registam os pedidos.
class _Server implements HttpClientAdapter {
  final Map<String, Object> replies;
  final List<RequestOptions> requests = [];
  _Server(this.replies);

  @override
  Future<ResponseBody> fetch(
    RequestOptions o,
    Stream<Uint8List>? s,
    Future<void>? c,
  ) async {
    requests.add(o);
    final key = o.queryParameters['student_id'] == null
        ? o.path
        : '${o.path}?${o.queryParameters['student_id']}';
    final body = replies[key];
    if (body == null) {
      return ResponseBody.fromString('{"error":"NOT_FOUND"}', 404);
    }
    return ResponseBody.fromString(
      jsonEncode(body),
      200,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

/// Guarda o estado e permite mudar as escolhas «a meio» da verificação.
class _Store extends MemoryNotifyStateStore {
  void Function()? onSecondLoad;
  int loads = 0;
  _Store(super.state);

  @override
  Future<NotifyState> load() async {
    loads++;
    if (loads == 2) onSecondLoad?.call();
    return super.load();
  }
}

Dio _dio(_Server server) =>
    Dio(BaseOptions(baseUrl: 'https://x.test'))..httpClientAdapter = server;

void main() {
  final evening = DateTime(2026, 11, 5, 18, 30);
  final tomorrow = '2026-11-06';

  Map<String, Object> pulse({int chat = 0, List<Object> items = const []}) => {
    'items': items,
    'unread': items.length,
    'chatUnread': chat,
    'announcements': [],
  };

  test('pede só o que é novo, mostra e guarda as marcas', () async {
    final portal = _Server({
      '/api/mobile/notifications': pulse(
        chat: 2,
        items: [
          {
            'id': 'n1',
            'title': 'Trabalho novo',
            'body': 'Resumo de História',
            'eventType': 'academic.task.created',
            'read': false,
            'createdAt': '2026-11-05T17:00:00Z',
          },
        ],
      ),
    });
    final store = _Store(
      NotifyState(
        uid: 'u1',
        role: 'parent',
        lastNoticeAt: DateTime.utc(2026, 11, 5, 12),
        lastAnnouncementAt: DateTime.utc(2026, 11, 4),
        chatUnread: 1,
        reminderDay: '2026-11-05', // lembretes de hoje já foram
      ),
    );
    final shown = <PlannedAlert>[];
    final checker = NotifyChecker(
      portal: _dio(portal),
      worker: _dio(_Server({})),
      store: store,
      show: (a) async => shown.add(a),
    );

    expect(await checker.run(uid: 'u1', now: evening), 2);
    final q = portal.requests.single.queryParameters;
    expect(q['pulse'], '1');
    expect(q['after'], '2026-11-05T12:00:00.000Z');
    expect(q['announcements_after'], '2026-11-04T00:00:00.000Z');
    expect(shown.map((a) => a.key), ['notice:n1', 'chat']);

    final saved = await store.load();
    expect(saved.wasSurfaced('n1'), isTrue);
    expect(saved.chatUnread, 2);

    // Outra verificação com a mesma resposta: nada repetido.
    shown.clear();
    await checker.run(uid: 'u1', now: evening);
    expect(shown, isEmpty);
  });

  test('desligado, de noite ou noutra conta: nada se pede', () async {
    final portal = _Server({'/api/mobile/notifications': pulse()});
    Future<int> run(NotifyState s, DateTime now) => NotifyChecker(
      portal: _dio(portal),
      worker: _dio(_Server({})),
      store: MemoryNotifyStateStore(s),
      show: (_) async {},
    ).run(uid: 'u1', now: now);

    expect(await run(const NotifyState(phoneEnabled: false), evening), 0);
    expect(await run(const NotifyState(), DateTime(2026, 11, 5, 23)), 0);
    expect(portal.requests, isEmpty);
  });

  test('a escolha feita na app durante a verificação não se perde', () async {
    final portal = _Server({'/api/mobile/notifications': pulse(chat: 5)});
    final store = _Store(
      NotifyState(
        uid: 'u1',
        lastAnnouncementAt: DateTime.utc(2026, 11, 4),
        reminderDay: '2026-11-05',
      ),
    );
    store.onSecondLoad = () {
      // A pessoa desligou os lembretes enquanto a verificação corria.
      store.save(
        NotifyState(
          uid: 'u1',
          reminders: false,
          lastAnnouncementAt: DateTime.utc(2026, 11, 4),
        ),
      );
    };
    await NotifyChecker(
      portal: _dio(portal),
      worker: _dio(_Server({})),
      store: store,
      show: (_) async {},
    ).run(uid: 'u1', now: evening);
    final saved = await store.load();
    expect(saved.reminders, isFalse);
    expect(saved.chatUnread, 5);
  });

  test('aluno ao fim da tarde: lembrete do que é para amanhã', () async {
    final portal = _Server({
      '/api/mobile/notifications': pulse(),
      '/api/mobile/agenda': {
        'upcomingAssessments': [
          {'name': 'Teste 2', 'subjectName': 'Física', 'date': tomorrow},
        ],
      },
      '/api/mobile/work': {
        'tasks': [
          {
            'id': 't',
            'title': 'Ficha',
            'subjectName': 'Matemática',
            'state': 'open',
            'dueOn': tomorrow,
          },
        ],
      },
    });
    final store = MemoryNotifyStateStore(
      NotifyState(
        uid: 'u1',
        role: 'parent',
        student: true,
        lastAnnouncementAt: DateTime.utc(2026, 11, 4),
      ),
    );
    final shown = <PlannedAlert>[];
    await NotifyChecker(
      portal: _dio(portal),
      worker: _dio(_Server({})),
      store: store,
      show: (a) async => shown.add(a),
    ).run(uid: 'u1', now: evening);
    expect(shown.single.title, 'Amanhã: 1 avaliação e 1 trabalho');
    expect(
      shown.single.body,
      'Teste 2 de Física\nEntregar «Ficha» (Matemática)',
    );
    expect((await store.load()).reminderDay, '2026-11-05');
  });

  test('encarregado: educandos pelo Worker, cada um com o nome', () async {
    final portal = _Server({
      '/api/mobile/notifications': pulse(),
      '/api/mobile/agenda?w1': {
        'upcomingAssessments': [
          {'name': 'Prova', 'subjectName': 'Inglês', 'date': tomorrow},
        ],
      },
      '/api/mobile/work?w1': {'tasks': []},
      '/api/mobile/agenda?w2': {'upcomingAssessments': []},
      '/api/mobile/work?w2': {'tasks': []},
    });
    final worker = _Server({
      '/api/sga/wards': {
        'data': [
          {'id': 'w1', 'name': 'Ana Maria Costa'},
          {'id': 'w2', 'name': 'Rui Costa'},
        ],
      },
    });
    final shown = <PlannedAlert>[];
    await NotifyChecker(
      portal: _dio(portal),
      worker: _dio(worker),
      store: MemoryNotifyStateStore(
        NotifyState(
          uid: 'u1',
          role: 'parent',
          lastAnnouncementAt: DateTime.utc(2026, 11, 4),
        ),
      ),
      show: (a) async => shown.add(a),
    ).run(uid: 'u1', now: evening);
    expect(shown.single.body, 'Ana: Prova de Inglês');
    expect(worker.requests.single.path, '/api/sga/wards');
  });

  test(
    'sem rede, a verificação falha sem mostrar nada nem gastar marcas',
    () async {
      final store = MemoryNotifyStateStore(const NotifyState(uid: 'u1'));
      final checker = NotifyChecker(
        portal: _dio(_Server({})),
        worker: _dio(_Server({})),
        store: store,
        show: (_) async => fail('não devia mostrar nada'),
      );
      await expectLater(
        checker.run(uid: 'u1', now: evening),
        throwsA(isA<DioException>()),
      );
      expect((await store.load()).lastAnnouncementAt, isNull);
    },
  );
}
