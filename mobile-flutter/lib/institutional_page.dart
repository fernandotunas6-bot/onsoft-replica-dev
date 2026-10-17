import 'package:flutter/material.dart';
import 'package:fluentui_system_icons/fluentui_system_icons.dart';
import 'design/portal.dart';
import 'design/tokens.dart';
import 'design/widgets.dart';
import 'gateway.dart';

/// Estados mostrados ao aluno, iguais aos do Mobile V4 e do portal.
const documentStatusLabels = {
  'submitted': 'Recebido',
  'in_review': 'Em análise',
  'approved': 'Pronto a levantar',
  'fulfilled': 'Entregue',
  'rejected': 'Recusado',
  'cancelled': 'Cancelado',
};
const invoiceStatusLabels = {
  'open': 'Em aberto',
  'partially_paid': 'Pago em parte',
  'paid': 'Pago',
  'cancelled': 'Anulada',
};
const receiptStatusLabels = {'issued': 'Emitido', 'reversed': 'Anulado'};

/// Read-only client of existing institutional endpoints; no local academic data.
class InstitutionalPage extends StatefulWidget {
  const InstitutionalPage({
    super.key,
    required this.gateway,
    required this.collection,
  });
  final MobileGateway gateway;
  final String collection;
  @override
  State<InstitutionalPage> createState() => _InstitutionalPageState();
}

class _InstitutionalPageState extends State<InstitutionalPage> {
  late Future<Map<String, dynamic>> data;

  /// Avisos marcados como lidos nesta visita (já gravados no SIGA).
  final readNow = <String>{};

  /// Marca avisos como lidos no SIGA: os [ids], ou todos quando null.
  Future<void> markRead(List<String>? ids) async {
    try {
      await widget.gateway.markNoticesRead(ids: ids);
      if (!mounted) return;
      if (ids == null) {
        setState(reload);
      } else {
        setState(() => readNow.addAll(ids));
      }
      ActivityScope.maybeOf(context)?.refresh();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.maybeOf(context)?.showSnackBar(
        SnackBar(
          content: Text(
            e is CommandError ? e.message : 'Sem ligação. Tente de novo.',
          ),
        ),
      );
    }
  }

  @override
  void initState() {
    super.initState();
    reload();
  }

  void reload() {
    data = widget.gateway.read(widget.collection);
  }

  List<Map<String, dynamic>> rows(Map<String, dynamic> result, String key) {
    final value = result[key];
    if (value is! List ||
        value.length > 1000 ||
        value.any((r) => r is! Map<String, dynamic>)) {
      throw const FormatException('Resposta inválida.');
    }
    return value.cast<Map<String, dynamic>>();
  }

  String text(dynamic value) {
    if (value is! String) throw const FormatException('Texto inválido.');
    return value;
  }

  String average(dynamic value) {
    if (value == null) return '—';
    if (value is! num || !value.isFinite) {
      throw const FormatException('Nota inválida.');
    }
    // Uma casa decimal, com vírgula (14,6); inteiros sem casas.
    return value == value.roundToDouble()
        ? '${value.round()}'
        : value.toStringAsFixed(1).replaceAll('.', ',');
  }

  String money(dynamic value) {
    if (value is! int || value < 0 || value > 9007199254740991) {
      throw const FormatException('Valor inválido.');
    }
    // Milhares separados por espaço inseparável, como em Angola: 25 000,00.
    final units = '${value ~/ 100}'.replaceAllMapped(
      RegExp(r'\B(?=(\d{3})+$)'),
      (_) => '\u00a0',
    );
    return '$units,${(value % 100).toString().padLeft(2, '0')}';
  }

  String label(Map<String, String> labels, dynamic value) =>
      labels[text(value)] ?? text(value);

  /// Cartão de um registo: ícone, título, linhas de detalhe e estado.
  Widget record({
    required IconData icon,
    required String title,
    List<String> lines = const [],
    String? status,
    bool highlight = false,
    List<Widget> footer = const [],
    VoidCallback? onTap,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: Siga.s1),
    child: SigaCard(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              IconBadge(icon, size: 40, accent: highlight),
              const SizedBox(width: Siga.s2),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: Theme.of(context).textTheme.titleMedium),
                    for (final line in lines)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(
                          line,
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ),
                  ],
                ),
              ),
              if (status != null) ...[
                const SizedBox(width: Siga.s1),
                StatusTag(status, accent: highlight),
              ],
            ],
          ),
          ...footer,
        ],
      ),
    ),
  );

  /// Resultado de uma pauta publicada, como no portal.
  static const resultLabels = {
    'pending': ('Por apurar', Color(0xff8e949e)),
    'pass': ('Aprovado', Color(0xff1f9d55)),
    'fail': ('Reprovado', Color(0xffd92c3a)),
    'incomplete': ('Incompleto', Color(0xffe8890c)),
  };

  /// Pauta publicada: média em destaque, médias parciais e resultado.
  Widget resultCard(Map<String, dynamic> r) {
    final palette = SigaPalette.of(context);
    final (label, color) =
        resultLabels[r['result']] ?? (text(r['result']), palette.ink2);
    final published = r['publishedAt'] is String
        ? DateTime.tryParse(r['publishedAt'] as String)
        : null;
    Widget part(String name, dynamic value) => Expanded(
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: palette.surface2,
          borderRadius: BorderRadius.circular(Siga.rSmall),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(name, style: TextStyle(fontSize: 11, color: palette.ink2)),
            Text(
              average(value),
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ],
        ),
      ),
    );
    return Padding(
      padding: const EdgeInsets.only(bottom: Siga.s1),
      child: SigaCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        text(r['title']),
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      Text(
                        [
                          r['kind'] == 'annual'
                              ? 'Pauta anual'
                              : 'Pauta do período',
                          if (published != null)
                            'publicada a ${published.day}/${published.month}/${published.year}',
                        ].join(' · '),
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 5,
                  ),
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: .12),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    label,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: color,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: Siga.s2),
            Text(
              average(r['termAverage']),
              style: const TextStyle(
                fontSize: 34,
                fontWeight: FontWeight.w700,
                letterSpacing: -1,
              ),
            ),
            Text(
              'Média final publicada',
              style: TextStyle(fontSize: 12, color: palette.ink2),
            ),
            const SizedBox(height: Siga.s2),
            Row(
              children: [
                part('Avaliação contínua', r['continuousAverage']),
                const SizedBox(width: Siga.s1),
                part('Provas', r['examAverage']),
              ],
            ),
          ],
        ),
      ),
    );
  }

  List<Widget> content(Map<String, dynamic> result) {
    switch (widget.collection) {
      case 'notifications':
        final items = rows(result, 'items');
        bool unread(Map<String, dynamic> r) =>
            r['read'] == false && !readNow.contains(r['id']);
        return [
          if (items.any(unread))
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: () => markRead(null),
                child: const Text('Marcar todas como lidas'),
              ),
            ),
          for (final r in items)
            record(
              icon: unread(r)
                  ? FluentIcons.alert_badge_24_regular
                  : FluentIcons.alert_24_regular,
              title: text(r['title']),
              lines: [text(r['body'])],
              status: unread(r) ? 'Novo' : null,
              highlight: unread(r),
              onTap: unread(r) && r['id'] is String
                  ? () => markRead([r['id'] as String])
                  : null,
            ),
        ];
      case 'documents':
        return [
          for (final r in rows(result, 'requests'))
            record(
              icon: FluentIcons.document_text_24_regular,
              title: text(r['document']),
              status: label(documentStatusLabels, r['status']),
              highlight: r['status'] == 'approved',
            ),
        ];
      case 'results':
        return [for (final r in rows(result, 'sheets')) resultCard(r)];
      case 'finance':
        return [
          for (final r in rows(result, 'invoices'))
            record(
              icon: FluentIcons.wallet_24_regular,
              title: text(r['label']),
              lines: [
                'Factura ${text(r['number'])} · vence ${text(r['due'])}',
                'Valor base: ${money(r['amountCents'])}',
              ],
              status: label(invoiceStatusLabels, r['status']),
              highlight:
                  r['status'] == 'open' || r['status'] == 'partially_paid',
              footer: [
                for (final receipt in rows(r, 'receipts'))
                  Padding(
                    padding: const EdgeInsets.only(top: Siga.s1, left: 56),
                    child: Row(
                      children: [
                        const Icon(FluentIcons.receipt_24_regular, size: 18),
                        const SizedBox(width: Siga.s1),
                        Expanded(
                          child: Text(
                            'Recibo ${text(receipt['number'])} · '
                            '${money(receipt['amountCents'])}',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ),
                        Text(
                          label(receiptStatusLabels, receipt['status']),
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
              ],
            ),
        ];
      default:
        throw const FormatException('Serviço não suportado.');
    }
  }

  /// O que, a partir desta consulta, se faz no portal.
  String? get portal => switch (widget.collection) {
    'finance' =>
      'Pagar propinas e obter referências faz-se no portal SIGA Plus '
          '(Payflow) ou na tesouraria.',
    'documents' =>
      'Novos pedidos de documentos fazem-se no portal SIGA Plus ou na '
          'secretaria.',
    _ => null,
  };

  String? get note => switch (widget.collection) {
    'notifications' =>
      'Sincronizado com o SIGA: toque num aviso novo para o marcar como '
          'lido, aqui e no portal.',
    'finance' =>
      'O valor base de cada factura não representa o saldo em dívida.',
    _ => null,
  };

  @override
  Widget build(BuildContext context) => FutureBuilder<Map<String, dynamic>>(
    future: data,
    builder: (context, snapshot) {
      if (snapshot.connectionState != ConnectionState.done) {
        return const Center(child: CircularProgressIndicator());
      }
      List<Widget> children = [];
      var failed = snapshot.hasError;
      if (!failed) {
        try {
          children = content(snapshot.data!);
        } on FormatException {
          failed = true;
        }
      }
      if (failed) {
        return Center(
          child: Padding(
            padding: const EdgeInsets.all(Siga.s3),
            child: EmptyState(
              icon: FluentIcons.cloud_off_24_regular,
              message: 'Não foi possível carregar esta consulta institucional.',
              action: 'Tentar novamente',
              onAction: () => setState(reload),
            ),
          ),
        );
      }
      return RefreshIndicator(
        onRefresh: () async {
          setState(reload);
          try {
            await data;
          } catch (_) {
            /* shown by FutureBuilder */
          }
        },
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(Siga.s3),
          children: [
            if (children.isEmpty)
              const EmptyState(
                message: 'Sem registos disponíveis neste contexto.',
              ),
            ...children,
            if (note != null) ...[
              const SizedBox(height: Siga.s2),
              Text(note!, style: Theme.of(context).textTheme.bodySmall),
            ],
            if (portal != null) PortalHint(portal!),
          ],
        ),
      );
    },
  );
}
