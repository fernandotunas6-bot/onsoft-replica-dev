import 'package:flutter/material.dart';
import 'academic.dart' show luandaClock;
import 'design/tokens.dart';
import 'design/widgets.dart';
import 'gateway.dart';

class ChatHistoryPage extends StatefulWidget {
  const ChatHistoryPage({
    super.key,
    required this.gateway,
    required this.id,
    required this.name,
  });
  final MobileGateway gateway;
  final String id;
  final String name;
  @override
  State<ChatHistoryPage> createState() => _ChatHistoryState();
}

class _ChatHistoryState extends State<ChatHistoryPage> {
  List<Map<String, dynamic>> messages = [];
  Map<String, dynamic>? cursor;
  bool busy = true;
  String? error;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    setState(() {
      busy = true;
      error = null;
    });
    // Com cursor, a página pedida é mais antiga do que a que já está no ecrã.
    final older = cursor != null;
    try {
      final result = await widget.gateway.chatHistory(
        widget.id,
        before: cursor,
      );
      final rows = result['messages'] as List;
      if (rows.length > 60 ||
          rows.any(
            (r) =>
                r is! Map<String, dynamic> ||
                r['id'] is! String ||
                r['body'] is! String ||
                r['senderName'] is! String ||
                r['deleted'] is! bool,
          )) {
        throw const FormatException('Histórico inválido.');
      }
      final next = result['next'];
      if (next != null &&
          (next is! Map<String, dynamic> ||
              next['date'] is! String ||
              next['id'] is! String)) {
        throw const FormatException('Cursor inválido.');
      }
      if (!mounted) return;
      final seen = messages.map((m) => m['id']).toSet();
      setState(() {
        // O servidor devolve cada página da mais antiga para a mais recente.
        final page = rows
            .cast<Map<String, dynamic>>()
            .where((m) => seen.add(m['id']))
            .toList();
        if (older) {
          messages.insertAll(0, page);
        } else {
          messages.addAll(page);
        }
        cursor = next as Map<String, dynamic>?;
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          error = 'Não foi possível carregar o histórico.';
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          busy = false;
        });
      }
    }
  }

  /// Hora da mensagem no relógio de Luanda; sem data válida, nada.
  String time(dynamic value) {
    final parsed = value is String ? DateTime.tryParse(value) : null;
    if (parsed == null) return '';
    final local = luandaClock(parsed);
    return '${local.hour.toString().padLeft(2, '0')}:'
        '${local.minute.toString().padLeft(2, '0')}';
  }

  Widget bubble(Map<String, dynamic> message) {
    final scheme = Theme.of(context).colorScheme;
    final palette = SigaPalette.of(context);
    final mine = message['senderId'] == widget.gateway.userId;
    final deleted = message['deleted'] == true;
    final reply = message['reply'];
    final attachment = message['attachment'];
    final ink = mine ? Colors.white : scheme.onSurface;
    final soft = mine ? Colors.white70 : palette.ink2;
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.sizeOf(context).width * .78,
        ),
        child: Container(
          margin: const EdgeInsets.only(bottom: Siga.s1),
          padding: const EdgeInsets.fromLTRB(14, 10, 14, 8),
          decoration: BoxDecoration(
            color: mine ? scheme.primary : palette.surface2,
            borderRadius: BorderRadius.only(
              topLeft: const Radius.circular(18),
              topRight: const Radius.circular(18),
              bottomLeft: Radius.circular(mine ? 18 : 4),
              bottomRight: Radius.circular(mine ? 4 : 18),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (!mine)
                Text(
                  message['senderName'] as String,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: scheme.primary,
                  ),
                ),
              if (reply is Map && reply['body'] is String)
                Container(
                  margin: const EdgeInsets.only(top: 4, bottom: 6),
                  padding: const EdgeInsets.only(left: Siga.s1),
                  decoration: BoxDecoration(
                    border: Border(left: BorderSide(color: soft, width: 3)),
                  ),
                  child: Text(
                    '${reply['senderName'] ?? ''}: ${reply['body']}',
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 12, color: soft),
                  ),
                ),
              Text(
                deleted ? 'Mensagem eliminada' : message['body'] as String,
                style: TextStyle(
                  color: ink,
                  fontStyle: deleted ? FontStyle.italic : FontStyle.normal,
                ),
              ),
              if (attachment != null)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.attach_file, size: 16, color: soft),
                      const SizedBox(width: 4),
                      Flexible(
                        child: Text(
                          attachment is Map && attachment['name'] is String
                              ? '${attachment['name']} · abertura em integração'
                              : 'Anexo · abertura em integração',
                          style: TextStyle(fontSize: 12, color: soft),
                        ),
                      ),
                    ],
                  ),
                ),
              Align(
                alignment: Alignment.centerRight,
                child: Text(
                  time(message['createdAt']),
                  style: TextStyle(fontSize: 11, color: soft),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      titleSpacing: 0,
      title: Row(
        children: [
          InitialsAvatar(widget.name, size: 36),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              widget.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    ),
    body: ListView(
      padding: const EdgeInsets.fromLTRB(Siga.s2, Siga.s1, Siga.s2, Siga.s3),
      children: [
        if (busy && messages.isEmpty)
          const Padding(
            padding: EdgeInsets.all(Siga.s3),
            child: Center(child: CircularProgressIndicator()),
          )
        else if (cursor != null && error == null)
          Center(
            child: TextButton(
              onPressed: busy ? null : load,
              child: Text(busy ? 'A carregar…' : 'Mensagens mais antigas'),
            ),
          ),
        if (messages.isEmpty && !busy && error == null)
          const EmptyState(message: 'Sem mensagens nesta conversa.'),
        for (final message in messages) bubble(message),
        if (error != null)
          EmptyState(
            icon: Icons.cloud_off_outlined,
            message: error!,
            action: 'Tentar novamente',
            onAction: load,
          ),
        const SizedBox(height: Siga.s2),
        Text(
          'Consulta do histórico. Envio e anexos aguardam a integração no '
          'servidor.',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodySmall,
        ),
      ],
    ),
  );
}
