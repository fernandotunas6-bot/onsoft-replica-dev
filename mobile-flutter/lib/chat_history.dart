import 'package:flutter/material.dart';
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
        messages.addAll(
          rows.cast<Map<String, dynamic>>().where((m) => seen.add(m['id'])),
        );
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

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(widget.name)),
    body: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        if (messages.isEmpty && !busy && error == null)
          const Text('Sem mensagens nesta conversa.'),
        for (final message in messages)
          Padding(
            padding: const EdgeInsets.only(bottom: 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  message['senderName'] as String,
                  style: Theme.of(context).textTheme.titleSmall,
                ),
                const SizedBox(height: 6),
                Text(
                  message['deleted'] == true
                      ? 'Mensagem eliminada'
                      : message['body'] as String,
                ),
                if (message['attachment'] != null)
                  const Padding(
                    padding: EdgeInsets.only(top: 8),
                    child: Text('Anexo recebido · abertura em integração'),
                  ),
              ],
            ),
          ),
        if (error != null) ...[
          Text(error!),
          TextButton(onPressed: load, child: const Text('Tentar novamente')),
        ],
        if (busy)
          const Center(child: CircularProgressIndicator())
        else if (cursor != null && error == null)
          TextButton(
            onPressed: load,
            child: const Text('Mensagens mais antigas'),
          ),
        const SizedBox(height: 24),
        const Text(
          'Consulta do histórico. Envio e anexos aguardam integração das capacidades do servidor.',
        ),
      ],
    ),
  );
}
