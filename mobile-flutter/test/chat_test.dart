import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:siga_plus_flutter/chat.dart';
import 'package:siga_plus_flutter/chat_page.dart';
import 'package:siga_plus_flutter/gateway.dart';

const school = 'escola-1';
const user = 'utilizador-1';
const thread = 'conversa-1';

Map<String, dynamic> message({
  String id = 'm1',
  String author = 'Direcção',
  bool mine = false,
  String sentAt = '2026-10-16T07:30:00Z',
  Object? attachments = const [],
}) => {
  'id': id,
  'authorName': author,
  'mine': mine,
  'body': 'Bom dia.',
  'sentAt': sentAt,
  'attachments': attachments,
};

Map<String, dynamic> history({
  List<Map<String, dynamic>>? messages,
  Object? cursor,
  String id = thread,
}) => {
  'version': 1,
  'schoolId': school,
  'role': 'aluno',
  'userId': user,
  'threadId': id,
  'threadName': 'Direcção de turma',
  'messages': messages ?? [message()],
  'previousCursor': cursor,
};

void main() {
  test('messages arrive oldest first', () {
    final parsed = ChatHistory.parse(
      history(
        messages: [
          message(id: 'm2', sentAt: '2026-10-16T09:00:00Z'),
          message(id: 'm1', sentAt: '2026-10-16T07:30:00Z'),
        ],
      ),
      thread,
    );
    expect(parsed.messages.map((item) => item.id), ['m1', 'm2']);
    expect(parsed.hasOlder, isFalse);
  });

  test('an older page is declared', () {
    expect(
      ChatHistory.parse(history(cursor: 'cursor-opaco'), thread).hasOlder,
      isTrue,
    );
  });

  test('a conversation about another thread is refused', () {
    expect(
      () => ChatHistory.parse(history(id: 'outra-conversa'), thread),
      throwsA(isA<FormatException>()),
    );
  });

  test('a malformed message or attachment is refused', () {
    for (final broken in [
      message(id: ''),
      message(author: ''),
      message(sentAt: 'ontem'),
      message(attachments: 'circular.pdf'),
      message(
        attachments: const [
          {'name': 'circular.pdf'},
        ],
      ),
      message(
        attachments: const [
          {'name': 'circular.pdf', 'bytes': -1},
        ],
      ),
    ]) {
      expect(
        () => ChatHistory.parse(history(messages: [broken]), thread),
        throwsA(isA<FormatException>()),
        reason: broken.toString(),
      );
    }
  });

  test('attachment sizes are readable', () {
    final parsed = ChatHistory.parse(
      history(
        messages: [
          message(
            attachments: const [
              {'name': 'circular.pdf', 'bytes': 2048},
              {'name': 'foto.jpg', 'bytes': 3145728},
            ],
          ),
        ],
      ),
      thread,
    );
    expect(parsed.messages.single.attachments.first.size, '2 KB');
    expect(parsed.messages.single.attachments.last.size, '3.0 MB');
  });

  testWidgets('history reads without offering a send button', (tester) async {
    final gateway = MobileGateway(
      Uri.parse('https://m.portal-siga.com'),
      () async => 'token',
      client: MockClient(
        (_) async => http.Response(jsonEncode(history()), 200),
      ),
    );
    gateway.select(user, school, 'aluno');
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ChatHistoryPage(gateway: gateway, threadId: thread),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Direcção de turma'), findsOneWidget);
    expect(find.text('Bom dia.'), findsOneWidget);
    expect(find.byType(TextField), findsNothing);
    expect(find.textContaining('Leitura apenas'), findsOneWidget);
  });

  testWidgets('a reply from another school never reaches the page', (
    tester,
  ) async {
    final gateway = MobileGateway(
      Uri.parse('https://m.portal-siga.com'),
      () async => 'token',
      client: MockClient(
        (_) async => http.Response(
          jsonEncode(history()..['schoolId'] = 'outra-escola'),
          200,
        ),
      ),
    );
    gateway.select(user, school, 'aluno');
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ChatHistoryPage(gateway: gateway, threadId: thread),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('Verifique a ligação'), findsOneWidget);
  });
}
