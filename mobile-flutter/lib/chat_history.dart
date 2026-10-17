import 'package:flutter/material.dart';
import 'package:fluentui_system_icons/fluentui_system_icons.dart';
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

  /// O servidor aceita envio? null enquanto se verifica.
  bool? canSend;
  bool sending = false;
  final input = TextEditingController();

  /// Pedido em curso: repetir com o mesmo identificador não duplica a
  /// mensagem no SIGA; muda quando o texto muda.
  String? requestId;
  String? requestBody;

  @override
  void initState() {
    super.initState();
    load().then((_) => markRead());
    widget.gateway
        .chatWrites()
        .then((value) {
          if (mounted) setState(() => canSend = value);
          if (value) markRead();
        })
        .catchError((_) {
          if (mounted) setState(() => canSend = false);
        });
  }

  @override
  void dispose() {
    input.dispose();
    super.dispose();
  }

  /// Marca a conversa como lida no SIGA até à última mensagem recebida.
  Future<void> markRead() async {
    if (canSend != true) return;
    final last = messages.lastWhere(
      (m) => m['senderId'] != widget.gateway.userId,
      orElse: () => const {},
    );
    if (last['id'] is! String) return;
    try {
      await widget.gateway.chatCommand({
        'type': 'read',
        'conversationId': widget.id,
        'messageId': last['id'],
      });
    } catch (_) {
      // Ler é acessório: sem ligação, a conversa continua por ler no SIGA.
    }
  }

  Future<void> send() async {
    final body = input.text.trim();
    if (body.isEmpty || sending) return;
    if (body.length > 4000) {
      notify('A mensagem tem mais de 4000 caracteres.');
      return;
    }
    if (body != requestBody) {
      requestBody = body;
      requestId = newRequestId();
    }
    setState(() => sending = true);
    try {
      final result = await widget.gateway.chatCommand({
        'type': 'send',
        'conversationId': widget.id,
        'body': body,
      }, requestId: requestId);
      if (!mounted) return;
      setState(() {
        messages.add({
          'id': result['messageId'] ?? requestId,
          'senderId': widget.gateway.userId,
          'senderName': '',
          'body': body,
          'createdAt': DateTime.now().toUtc().toIso8601String(),
          'deleted': false,
          'status': 'sent',
          'reply': null,
          'attachment': null,
        });
        input.clear();
        requestId = requestBody = null;
      });
    } catch (e) {
      notify(e is CommandError ? e.message : 'Sem ligação. Tente de novo.');
    } finally {
      if (mounted) setState(() => sending = false);
    }
  }

  Future<void> remove(Map<String, dynamic> message) async {
    final confirmed = await showSigaSheet<bool>(
      context,
      title: 'Apagar mensagem',
      builder: (sheet) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('A mensagem fica apagada para todos, também no SIGA.'),
          const SizedBox(height: Siga.s2),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(sheet).colorScheme.error,
            ),
            onPressed: () => Navigator.of(sheet).pop(true),
            child: const Text('Apagar'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await widget.gateway.chatCommand({
        'type': 'delete',
        'conversationId': widget.id,
        'messageId': message['id'],
      });
      if (mounted) {
        setState(() {
          message['deleted'] = true;
          message['body'] = '';
        });
      }
    } catch (e) {
      notify(e is CommandError ? e.message : 'Sem ligação. Tente de novo.');
    }
  }

  void notify(String text) => ScaffoldMessenger.maybeOf(
    context,
  )?.showSnackBar(SnackBar(content: Text(text)));

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
    final bubble = Align(
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
                      Icon(
                        FluentIcons.attach_24_regular,
                        size: 16,
                        color: soft,
                      ),
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
    if (!mine || deleted || canSend != true) return bubble;
    return GestureDetector(onLongPress: () => remove(message), child: bubble);
  }

  Widget composer() {
    final palette = SigaPalette.of(context);
    final scheme = Theme.of(context).colorScheme;
    if (canSend != true) {
      return SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Siga.s3, Siga.s1, Siga.s3, 12),
          child: Text(
            canSend == null
                ? 'A verificar o envio…'
                : 'Histórico sincronizado com o SIGA. O envio ainda não está '
                      'activo no servidor da escola.',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ),
      );
    }
    return DecoratedBox(
      decoration: BoxDecoration(
        color: scheme.surface,
        border: Border(top: BorderSide(color: palette.line)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Siga.s2, 8, 8, 8),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: TextField(
                  controller: input,
                  minLines: 1,
                  maxLines: 5,
                  maxLength: 4000,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: InputDecoration(
                    hintText: 'Escrever mensagem…',
                    counterText: '',
                    isDense: true,
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 12,
                    ),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(22),
                      borderSide: BorderSide.none,
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(22),
                      borderSide: BorderSide.none,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 6),
              IconButton.filled(
                tooltip: 'Enviar',
                onPressed: sending ? null : send,
                icon: sending
                    ? const SizedBox.square(
                        dimension: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(FluentIcons.send_24_filled),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    bottomNavigationBar: composer(),
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
            icon: FluentIcons.cloud_off_24_regular,
            message: error!,
            action: 'Tentar novamente',
            onAction: load,
          ),
        if (canSend == true) ...[
          const SizedBox(height: Siga.s2),
          Text(
            'Sincronizado com o SIGA. Toque longo numa mensagem sua para a '
            'apagar. Anexos abrem-se no portal.',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ],
    ),
  );
}
