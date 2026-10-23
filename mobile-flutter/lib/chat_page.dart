import 'package:flutter/material.dart';
import 'chat.dart';
import 'gateway.dart';

/// Histórico de uma conversa, em leitura.
///
/// Não há campo de escrita: o envio depende de endpoints que este cliente não
/// tem, e um botão de envio sem servidor seria um botão fictício.
class ChatHistoryPage extends StatefulWidget {
  const ChatHistoryPage({
    super.key,
    required this.gateway,
    required this.threadId,
  });
  final MobileGateway gateway;
  final String threadId;
  @override
  State<ChatHistoryPage> createState() => _ChatHistoryPageState();
}

class _ChatHistoryPageState extends State<ChatHistoryPage> {
  late Future<Map<String, dynamic>> data;
  @override
  void initState() {
    super.initState();
    load();
  }

  void load() {
    data = widget.gateway.readThread(widget.threadId);
  }

  String instant(DateTime value) {
    final local = value.toUtc().add(const Duration(hours: 1));
    return '${local.day}/${local.month} · '
        '${local.hour.toString().padLeft(2, '0')}:'
        '${local.minute.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<Map<String, dynamic>>(
    future: data,
    builder: (context, snapshot) {
      if (snapshot.connectionState != ConnectionState.done) {
        return const Center(child: CircularProgressIndicator());
      }
      if (snapshot.hasError) {
        return _failure(
          'Não foi possível carregar a conversa. Verifique a ligação ou volte '
          'a entrar.',
        );
      }
      ChatHistory history;
      try {
        history = ChatHistory.parse(snapshot.data!, widget.threadId);
      } on FormatException {
        return _failure(
          'A conversa recebida não corresponde ao contrato institucional.',
        );
      }
      final scheme = Theme.of(context).colorScheme;
      return RefreshIndicator(
        onRefresh: () async {
          setState(load);
          try {
            await data;
          } catch (_) {
            /* erro visível no estado */
          }
        },
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(24),
          children: [
            Text(
              history.threadName,
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 16),
            if (history.hasOlder)
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Text(
                  'Há mensagens mais antigas no servidor. A paginação ainda '
                  'não está implementada neste cliente.',
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ),
            if (history.messages.isEmpty)
              Text(
                'Sem mensagens nesta conversa.',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            for (final message in history.messages)
              Align(
                alignment: message.mine
                    ? Alignment.centerRight
                    : Alignment.centerLeft,
                child: Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(14),
                  constraints: BoxConstraints(
                    maxWidth: MediaQuery.sizeOf(context).width * .8,
                  ),
                  decoration: BoxDecoration(
                    color: message.mine
                        ? scheme.primaryContainer
                        : scheme.surfaceContainerHighest,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        message.authorName,
                        style: Theme.of(context).textTheme.labelMedium,
                      ),
                      const SizedBox(height: 4),
                      Text(message.body),
                      for (final file in message.attachments)
                        Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.attach_file, size: 16),
                              const SizedBox(width: 6),
                              Flexible(
                                child: Text('${file.name} · ${file.size}'),
                              ),
                            ],
                          ),
                        ),
                      const SizedBox(height: 6),
                      Text(
                        instant(message.sentAt),
                        style: Theme.of(context).textTheme.labelSmall,
                      ),
                    ],
                  ),
                ),
              ),
            const SizedBox(height: 8),
            const Text(
              'Leitura apenas. O envio, os anexos e as actualizações em tempo '
              'real dependem de endpoints de escrita e de capacidades '
              'instaladas por escola; use o portal para responder.',
            ),
          ],
        ),
      );
    },
  );

  Widget _failure(String message) => Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.cloud_off_outlined, size: 32),
          const SizedBox(height: 16),
          Text(message, textAlign: TextAlign.center),
          const SizedBox(height: 16),
          FilledButton.tonal(
            onPressed: () => setState(load),
            child: const Text('Tentar novamente'),
          ),
        ],
      ),
    ),
  );
}
