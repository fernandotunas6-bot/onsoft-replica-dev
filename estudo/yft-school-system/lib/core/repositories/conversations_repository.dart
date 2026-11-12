import 'package:dio/dio.dart';

/// Uma conversa na lista: a outra pessoa, a última mensagem e as por ler.
class ConversationSummary {
  final String id;
  final String otherUid;
  final String otherName;
  final String otherRole;
  final String? otherPhoto;
  final String? lastPreview;
  final String? lastMessageAt;
  final int unread;

  const ConversationSummary({
    required this.id,
    required this.otherUid,
    required this.otherName,
    required this.otherRole,
    this.otherPhoto,
    this.lastPreview,
    this.lastMessageAt,
    this.unread = 0,
  });

  factory ConversationSummary.fromJson(Map<String, dynamic> j) =>
      ConversationSummary(
        id: j['id'] as String,
        otherUid: j['other_uid'] as String,
        otherName: j['other_name'] as String? ?? 'Conta removida',
        otherRole: j['other_role'] as String? ?? '',
        otherPhoto: j['other_photo'] as String?,
        lastPreview: j['last_preview'] as String?,
        lastMessageAt: j['last_message_at'] as String?,
        unread: (j['unread'] as num?)?.toInt() ?? 0,
      );
}

class ChatMessage {
  final String id;
  final String body;
  final String createdAt;
  final bool mine;

  const ChatMessage({
    required this.id,
    required this.body,
    required this.createdAt,
    required this.mine,
  });

  factory ChatMessage.fromJson(Map<String, dynamic> j) => ChatMessage(
    id: j['id'] as String,
    body: j['body'] as String,
    createdAt: j['created_at'] as String,
    mine: j['mine'] == true,
  );
}

class ChatThread {
  final List<ChatMessage> messages;
  final String otherName;
  final String otherRole;

  /// Há mensagens anteriores às de [messages].
  final bool hasMore;

  const ChatThread(
    this.messages,
    this.otherName,
    this.otherRole, {
    this.hasMore = false,
  });
}

/// Alguém com quem posso começar uma conversa.
class ChatContact {
  final String uid;
  final String name;
  final String role;
  final String? photoUrl;
  final String? subjects;
  final String? wards;

  const ChatContact({
    required this.uid,
    required this.name,
    required this.role,
    this.photoUrl,
    this.subjects,
    this.wards,
  });

  factory ChatContact.fromJson(Map<String, dynamic> j) => ChatContact(
    uid: j['uid'] as String,
    name: j['name'] as String,
    role: j['role'] as String,
    photoUrl: j['photo_url'] as String?,
    subjects: j['subjects_text'] as String?,
    wards: j['wards'] as String?,
  );
}

/// "Professor · Matemática", "Encarregado de Ana", "Direcção".
String contactRoleLabel(String role, {String? subjects, String? wards}) =>
    switch (role) {
      'admin' => 'Direcção',
      'teacher' => (subjects?.isNotEmpty ?? false) ? 'Professor · $subjects' : 'Professor',
      'parent' => (wards?.isNotEmpty ?? false) ? 'Encarregado de $wards' : 'Encarregado',
      // Modo SIGA: o SIGA já dá o texto ("Professor", "Secretaria"…).
      _ => role,
    };

class ConversationsRepository {
  static const _base = '/api/conversations';
  final Dio _dio;

  ConversationsRepository(this._dio);

  Future<List<ConversationSummary>> list() async {
    final res = await _dio.get(_base);
    return (res.data['data'] as List)
        .map((e) => ConversationSummary.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<int> unreadCount() async {
    final res = await _dio.get('$_base/unread-count');
    return (res.data['unread_count'] as num?)?.toInt() ?? 0;
  }

  Future<List<ChatContact>> contacts() async {
    final res = await _dio.get('$_base/contacts');
    return (res.data['data'] as List)
        .map((e) => ChatContact.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Abre (ou reutiliza) a conversa com [userUid]; devolve o id.
  Future<String> open(String userUid) async {
    final res = await _dio.post(_base, data: {'user_uid': userUid});
    return res.data['id'] as String;
  }

  Future<ChatThread> thread(String id) async {
    final res = await _dio.get('$_base/$id/messages');
    final other = res.data['other'] as Map<String, dynamic>?;
    return ChatThread(
      (res.data['data'] as List)
          .map((e) => ChatMessage.fromJson(e as Map<String, dynamic>))
          .toList(),
      other?['name'] as String? ?? 'Conversa',
      other?['role'] as String? ?? '',
      hasMore: res.data['has_more'] == true,
    );
  }

  /// As mensagens anteriores a [beforeId] (uma página), por ordem.
  Future<({List<ChatMessage> messages, bool hasMore})> older(
    String id,
    String beforeId,
  ) async {
    final res = await _dio.get(
      '$_base/$id/messages',
      queryParameters: {'before': beforeId},
    );
    return (
      messages: (res.data['data'] as List)
          .map((e) => ChatMessage.fromJson(e as Map<String, dynamic>))
          .toList(),
      hasMore: res.data['has_more'] == true,
    );
  }

  Future<void> send(String id, String body) async {
    await _dio.post('$_base/$id/messages', data: {'body': body});
  }
}
