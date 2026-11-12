import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:yft_school_system/core/sga/sga_conversations.dart';

class _Portal implements HttpClientAdapter {
  final List<RequestOptions> requests = [];
  @override
  Future<ResponseBody> fetch(RequestOptions o, Stream<Uint8List>? s, Future<void>? c) async {
    requests.add(o);
    Object body;
    final q = o.queryParameters;
    if (o.method == 'POST') {
      final action = (o.data as Map)['action'];
      body = action == 'start' ? {'conversationId': 'c9'} : {'ok': true};
    } else if (q['contacts'] == '1') {
      body = [
        {'id': 'u-prof', 'name': 'Carlos Mendes', 'sub': 'Professor', 'avatarUrl': null},
      ];
    } else if (q.containsKey('conversation_id')) {
      body = q.containsKey('before')
          ? {'messages': [{'id': 'm0', 'ts': 1759300000000, 'text': 'Antiga', 'from': 'Carlos', 'deleted': false}], 'hasMore': false}
          : {
              'messages': [
                {'id': 'm1', 'ts': 1759312800000, 'text': 'Bom dia', 'from': 'Carlos Mendes', 'deleted': false},
                {'id': 'm2', 'ts': 1759316400000, 'text': 'x', 'from': 'me', 'deleted': true},
              ],
              'hasMore': true,
            };
    } else {
      body = {
        'storage': 'sga',
        'conversations': [
          {
            'id': 'c1', 'type': 'staff', 'name': 'Carlos Mendes', 'sub': 'Professor', 'peerId': 'u-prof',
            'avatarUrl': null, 'unread': 2,
            'messages': [{'id': 'last-c1', 'ts': 1759316400000, 'text': 'Até amanhã', 'from': 'me', 'deleted': false}],
          },
          {'id': 'c2', 'type': 'staff', 'name': 'Secretaria', 'sub': 'Secretaria', 'peerId': 'u-sec', 'unread': 1, 'messages': []},
        ],
      };
    }
    return ResponseBody.fromString(jsonEncode(body), 200, headers: {Headers.contentTypeHeader: ['application/json']});
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  late _Portal portal;
  late SgaConversationsRepository repo;
  setUp(() {
    portal = _Portal();
    repo = SgaConversationsRepository(Dio(BaseOptions(baseUrl: 'https://portal.test'))..httpClientAdapter = portal);
  });

  test('lista e por ler a partir do chat do SIGA', () async {
    final list = await repo.list();
    expect(list.first.otherName, 'Carlos Mendes');
    expect(list.first.otherRole, 'Professor');
    expect(list.first.lastPreview, 'Até amanhã');
    expect(DateTime.parse(list.first.lastMessageAt!).isUtc, isTrue);
    expect(list.last.lastPreview, isNull);
    expect(await repo.unreadCount(), 3);
  });

  test('abrir a conversa marca-a como lida; anteriores pela hora da mais antiga', () async {
    final t = await repo.thread('c1');
    expect(t.otherName, 'Carlos Mendes');
    expect(t.otherRole, 'Professor');
    expect(t.hasMore, isTrue);
    expect(t.messages.map((m) => (m.body, m.mine)), [('Bom dia', false), ('Mensagem apagada', true)]);
    final read = portal.requests.where((r) => r.method == 'POST').single;
    expect(read.data, {'action': 'read', 'conversation_id': 'c1'});

    final older = await repo.older('c1', 'm1');
    expect(portal.requests.last.queryParameters['before'], DateTime.fromMillisecondsSinceEpoch(1759312800000, isUtc: true).toIso8601String());
    expect(older.messages.single.body, 'Antiga');
  });

  test('contactos, começar conversa e enviar', () async {
    final c = await repo.contacts();
    expect((c.single.uid, c.single.role), ('u-prof', 'Professor'));
    expect(await repo.open('u-prof'), 'c9');
    await repo.send('c9', 'Olá');
    expect(portal.requests.last.data, {'action': 'send', 'conversation_id': 'c9', 'body': 'Olá'});
    expect(portal.requests.every((r) => r.uri.path == '/api/mobile/chat'), isTrue);
  });
}
