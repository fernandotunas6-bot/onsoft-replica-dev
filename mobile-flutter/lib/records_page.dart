import 'package:flutter/material.dart';
import 'gateway.dart';
import 'records.dart';

/// Avisos e resultados publicados. Uma resposta fora do contrato é um erro
/// visível: uma lista vazia diria «não há nada», que é outra coisa.
class RecordsPage extends StatefulWidget {
  const RecordsPage({
    super.key,
    required this.gateway,
    required this.collection,
  });
  final MobileGateway gateway;

  /// `notices` ou `results`.
  final String collection;
  @override
  State<RecordsPage> createState() => _RecordsPageState();
}

class _RecordsPageState extends State<RecordsPage> {
  late Future<Map<String, dynamic>> data;
  String query = '';
  @override
  void initState() {
    super.initState();
    load();
  }

  void load() {
    data = widget.gateway.read(widget.collection);
  }

  bool get isNotices => widget.collection == 'notices';
  bool matches(String value) => value.toLowerCase().contains(query);

  String instant(DateTime value) {
    // UTC+1 de Luanda, como no resto do cliente: o servidor envia UTC.
    final local = value.toUtc().add(const Duration(hours: 1));
    final time =
        '${local.hour.toString().padLeft(2, '0')}:'
        '${local.minute.toString().padLeft(2, '0')}';
    return '${local.day}/${local.month}/${local.year} · $time';
  }

  Widget empty(String label) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 24),
    child: Text(label, style: Theme.of(context).textTheme.bodyMedium),
  );

  Widget failure(String message) => Center(
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

  void detail(Notice item) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (context) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                item.title,
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 8),
              Text(instant(item.publishedAt)),
              const SizedBox(height: 16),
              Text(item.body),
              const SizedBox(height: 24),
              const Text(
                'Marcar avisos como lidos depende de um endpoint de escrita '
                'que este cliente ainda não tem.',
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<Map<String, dynamic>>(
    future: data,
    builder: (context, snapshot) {
      if (snapshot.connectionState != ConnectionState.done) {
        return const Center(child: CircularProgressIndicator());
      }
      if (snapshot.hasError) {
        return failure(
          'Não foi possível carregar os dados. Verifique a ligação ou volte a '
          'entrar.',
        );
      }
      NoticeFeed? feed;
      ResultSheet? sheet;
      try {
        if (isNotices) {
          feed = NoticeFeed.parse(snapshot.data!);
        } else {
          sheet = ResultSheet.parse(snapshot.data!);
        }
      } on FormatException {
        return failure(
          isNotices
              ? 'Os avisos recebidos não correspondem ao contrato '
                    'institucional.'
              : 'Os resultados recebidos não correspondem ao contrato '
                    'institucional.',
        );
      }
      final notices = feed?.items
          .where((item) => matches('${item.title} ${item.body}'))
          .toList();
      final terms = sheet?.byTerm;
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
            TextField(
              decoration: const InputDecoration(
                hintText: 'Pesquisar…',
                prefixIcon: Icon(Icons.search),
              ),
              onChanged: (value) => setState(() {
                query = value.trim().toLowerCase();
              }),
            ),
            const SizedBox(height: 16),
            if (isNotices) ...[
              if (notices!.isEmpty)
                empty('Sem avisos para os filtros escolhidos.'),
              for (final item in notices)
                ListTile(
                  contentPadding: const EdgeInsets.symmetric(vertical: 8),
                  leading: Icon(
                    item.read
                        ? Icons.notifications_none
                        : Icons.notifications_active_outlined,
                    color: item.read
                        ? null
                        : Theme.of(context).colorScheme.primary,
                  ),
                  title: Text(item.title),
                  subtitle: Text(
                    '${item.category ?? 'Aviso'} · '
                    '${instant(item.publishedAt)}',
                  ),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => detail(item),
                ),
              if (feed!.hasMore) ...[
                const SizedBox(height: 16),
                const Text(
                  'Há mais avisos no servidor. A paginação ainda não está '
                  'implementada neste cliente.',
                ),
              ],
            ] else ...[
              if (sheet!.items.isEmpty)
                empty('Sem resultados neste vínculo.')
              else if (terms!.values.every(
                (list) => list.every(
                  (item) => !matches('${item.subjectName} ${item.kind}'),
                ),
              ))
                empty('Sem resultados para os filtros escolhidos.'),
              for (final term in terms!.entries)
                if (term.value.any(
                  (item) => matches('${item.subjectName} ${item.kind}'),
                )) ...[
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    child: Text(
                      term.key,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                  for (final item in term.value)
                    if (matches('${item.subjectName} ${item.kind}'))
                      ListTile(
                        contentPadding: const EdgeInsets.symmetric(vertical: 8),
                        leading: Icon(
                          item.published
                              ? Icons.grade_outlined
                              : Icons.hourglass_empty,
                        ),
                        title: Text(item.subjectName),
                        subtitle: Text(
                          item.published
                              ? '${item.kind} · '
                                    '${instant(item.publishedAt!)}'
                              : item.kind,
                        ),
                        trailing: Text(
                          item.display,
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                      ),
                ],
              const SizedBox(height: 16),
              const Text(
                'Notas publicadas pela escola, na escala que a escola define. '
                'Médias, pautas oficiais e pedidos de alteração continuam no '
                'portal.',
              ),
            ],
          ],
        ),
      );
    },
  );
}
