import 'package:dio/dio.dart';

import '../repositories/conversations_repository.dart';

/// Conversas no modo SIGA: o chat do próprio SIGA, pelas rotas
/// `/api/mobile/chat` do portal (as regras são as do SIGA: só membros lêem,
/// o encarregado só escreve ao pessoal da escola). Mesma interface do
/// repositório antigo, para os ecrãs não mudarem.
class SgaConversationsRepository extends ConversationsRepository {
  static const _path = '/api/mobile/chat';
  final Dio _portal;

  /// Conversas vistas na última lista: o nome e o papel da outra pessoa.
  final Map<String, ConversationSummary> _known = {};

  /// Hora de cada mensagem carregada, para pedir as anteriores a ela.
  final Map<String, String> _messageTime = {};

  SgaConversationsRepository(this._portal) : super(_portal);

  static String _iso(Object? ts) => ts is num
      ? DateTime.fromMillisecondsSinceEpoch(
          ts.toInt(),
          isUtc: true,
        ).toIso8601String()
      : '';

  @override
  Future<List<ConversationSummary>> list() async {
    final res = await _portal.get(_path);
    final list = <ConversationSummary>[
      for (final c
          in (res.data['conversations'] as List? ?? const [])
              .cast<Map<String, dynamic>>())
        () {
          final last = (c['messages'] as List? ?? const [])
              .cast<Map<String, dynamic>>()
              .lastOrNull;
          return ConversationSummary(
            id: c['id'] as String,
            otherUid: c['peerId'] as String? ?? '',
            otherName: c['name'] as String? ?? 'Conversa',
            otherRole: c['sub'] as String? ?? '',
            otherPhoto: c['avatarUrl'] as String?,
            lastPreview: last == null
                ? null
                : (last['deleted'] == true
                      ? 'Mensagem apagada'
                      : last['text'] as String?),
            lastMessageAt: last == null ? null : _iso(last['ts']),
            unread: (c['unread'] as num?)?.toInt() ?? 0,
          );
        }(),
    ];
    _known
      ..clear()
      ..addEntries(list.map((c) => MapEntry(c.id, c)));
    return list;
  }

  @override
  Future<int> unreadCount() async =>
      (await list()).fold<int>(0, (sum, c) => sum + c.unread);

  @override
  Future<List<ChatContact>> contacts() async {
    final res = await _portal.get(_path, queryParameters: {'contacts': '1'});
    return [
      for (final c
          in (res.data as List? ?? const []).cast<Map<String, dynamic>>())
        ChatContact(
          uid: c['id'] as String,
          name: c['name'] as String? ?? 'Contacto',
          role: c['sub'] as String? ?? '',
          photoUrl: c['avatarUrl'] as String?,
        ),
    ];
  }

  @override
  Future<String> open(String userUid) async {
    final res = await _portal.post(
      _path,
      data: {'action': 'start', 'peer_id': userUid},
    );
    return res.data['conversationId'] as String;
  }

  List<ChatMessage> _messages(Object? raw) => [
    for (final m in (raw as List? ?? const []).cast<Map<String, dynamic>>())
      () {
        final msg = ChatMessage(
          id: m['id'] as String,
          body: m['deleted'] == true
              ? 'Mensagem apagada'
              : (m['text'] as String? ?? ''),
          createdAt: _iso(m['ts']),
          mine: m['from'] == 'me',
        );
        _messageTime[msg.id] = msg.createdAt;
        return msg;
      }(),
  ];

  @override
  Future<ChatThread> thread(String id) async {
    if (!_known.containsKey(id)) await list();
    final res = await _portal.get(
      _path,
      queryParameters: {'conversation_id': id},
    );
    // Abrir a conversa marca-a como lida (no SIGA é um pedido à parte).
    await _portal.post(_path, data: {'action': 'read', 'conversation_id': id});
    final other = _known[id];
    return ChatThread(
      _messages(res.data['messages']),
      other?.otherName ?? 'Conversa',
      other?.otherRole ?? '',
      hasMore: res.data['hasMore'] == true,
    );
  }

  @override
  Future<({List<ChatMessage> messages, bool hasMore})> older(
    String id,
    String beforeId,
  ) async {
    final before = _messageTime[beforeId];
    if (before == null || before.isEmpty) {
      return (messages: const <ChatMessage>[], hasMore: false);
    }
    final res = await _portal.get(
      _path,
      queryParameters: {'conversation_id': id, 'before': before},
    );
    return (
      messages: _messages(res.data['messages']),
      hasMore: res.data['hasMore'] == true,
    );
  }

  @override
  Future<void> send(String id, String body) async {
    await _portal.post(
      _path,
      data: {'action': 'send', 'conversation_id': id, 'body': body},
    );
  }
}
