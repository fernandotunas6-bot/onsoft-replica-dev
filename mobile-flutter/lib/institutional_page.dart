import 'package:flutter/material.dart';
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
    if (value == null) return 'Não disponível';
    if (value is! num || !value.isFinite) {
      throw const FormatException('Nota inválida.');
    }
    return '$value';
  }

  String money(dynamic value) {
    if (value is! int || value < 0 || value > 9007199254740991) {
      throw const FormatException('Valor inválido.');
    }
    return '${value ~/ 100},${(value % 100).toString().padLeft(2, '0')}';
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
  }) => Padding(
    padding: const EdgeInsets.only(bottom: Siga.s1),
    child: SigaCard(
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

  List<Widget> content(Map<String, dynamic> result) {
    switch (widget.collection) {
      case 'notifications':
        return [
          for (final r in rows(result, 'items'))
            record(
              icon: Icons.notifications_none,
              title: text(r['title']),
              lines: [text(r['body'])],
            ),
        ];
      case 'documents':
        return [
          for (final r in rows(result, 'requests'))
            record(
              icon: Icons.description_outlined,
              title: text(r['document']),
              status: label(documentStatusLabels, r['status']),
              highlight: r['status'] == 'approved',
            ),
        ];
      case 'results':
        return [
          for (final r in rows(result, 'sheets'))
            record(
              icon: Icons.school_outlined,
              title: text(r['title']),
              lines: [
                'Média publicada: ${average(r['termAverage'])}',
                text(r['result']),
              ],
            ),
        ];
      case 'finance':
        return [
          for (final r in rows(result, 'invoices'))
            record(
              icon: Icons.account_balance_wallet_outlined,
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
                        const Icon(Icons.receipt_long_outlined, size: 18),
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

  String? get note => switch (widget.collection) {
    'notifications' =>
      'Últimos avisos. Não são marcados automaticamente como lidos.',
    'finance' =>
      'Consulta de facturas e recibos. Pagamento e reconciliação permanecem '
          'no Payflow; o valor base não representa o saldo em dívida.',
    'documents' =>
      'Consulta de pedidos. Novos pedidos são tratados no portal ou na '
          'secretaria.',
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
              icon: Icons.cloud_off_outlined,
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
          ],
        ),
      );
    },
  );
}
