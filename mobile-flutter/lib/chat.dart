/// Histórico de uma conversa, lido do contrato em backend/chat.ts.
///
/// Só leitura. Anexos chegam como nome e tamanho, nunca como ligação: um
/// endereço para o armazenamento da escola tem de ser assinado a cada pedido
/// pelo servidor que é dono da política.
library;

class ChatAttachment {
  const ChatAttachment({required this.name, required this.bytes});
  final String name;
  final int bytes;

  String get size => bytes < 1024
      ? '$bytes B'
      : bytes < 1024 * 1024
      ? '${(bytes / 1024).toStringAsFixed(0)} KB'
      : '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
}

class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.authorName,
    required this.mine,
    required this.body,
    required this.sentAt,
    required this.attachments,
  });
  final String id;
  final String authorName;
  final bool mine;
  final String body;
  final DateTime sentAt;
  final List<ChatAttachment> attachments;
}

class ChatHistory {
  const ChatHistory({
    required this.threadId,
    required this.threadName,
    required this.messages,
    required this.hasOlder,
  });
  final String threadId;
  final String threadName;
  final List<ChatMessage> messages;

  /// O servidor declarou uma página anterior que este cliente ainda não pede.
  final bool hasOlder;

  static ChatHistory parse(Map<String, dynamic> payload, String threadId) {
    final name = payload['threadName'];
    final messages = payload['messages'];
    final cursor = payload['previousCursor'];
    if (payload['version'] != 1 ||
        payload['threadId'] != threadId ||
        name is! String ||
        name.isEmpty ||
        messages is! List ||
        (cursor != null && cursor is! String)) {
      throw const FormatException('Conversa fora do contrato institucional.');
    }
    return ChatHistory(
      threadId: threadId,
      threadName: name,
      messages: messages.map(_message).toList()
        ..sort((a, b) => a.sentAt.compareTo(b.sentAt)),
      hasOlder: cursor is String && cursor.isNotEmpty,
    );
  }

  static ChatMessage _message(Object? item) {
    if (item is! Map<String, dynamic>) {
      throw const FormatException('Mensagem inválida.');
    }
    final id = item['id'];
    final author = item['authorName'];
    final mine = item['mine'];
    final body = item['body'];
    final sentAt = item['sentAt'] is String
        ? DateTime.tryParse(item['sentAt'] as String)
        : null;
    final attachments = item['attachments'];
    if (id is! String ||
        id.isEmpty ||
        author is! String ||
        author.isEmpty ||
        mine is! bool ||
        body is! String ||
        sentAt == null ||
        (attachments != null && attachments is! List)) {
      throw const FormatException('Mensagem fora do contrato institucional.');
    }
    return ChatMessage(
      id: id,
      authorName: author,
      mine: mine,
      body: body,
      sentAt: sentAt.toUtc(),
      attachments: ((attachments as List?) ?? const [])
          .map(_attachment)
          .toList(),
    );
  }

  static ChatAttachment _attachment(Object? item) {
    if (item is! Map<String, dynamic>) {
      throw const FormatException('Anexo inválido.');
    }
    final name = item['name'];
    final bytes = item['bytes'];
    // Um anexo com ligação não devia existir neste contrato; se vier, não se
    // apresenta como se fosse descarregável.
    if (name is! String || name.isEmpty || bytes is! int || bytes < 0) {
      throw const FormatException('Anexo fora do contrato institucional.');
    }
    return ChatAttachment(name: name, bytes: bytes);
  }
}
