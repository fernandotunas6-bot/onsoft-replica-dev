import 'package:flutter/material.dart';
import 'gateway.dart';

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

  List<Widget> content(Map<String, dynamic> result) {
    switch (widget.collection) {
      case 'notifications':
        return rows(result, 'items')
            .map(
              (r) => ListTile(
                leading: const Icon(Icons.notifications_outlined),
                title: Text(text(r['title'])),
                subtitle: Text(text(r['body'])),
              ),
            )
            .toList();
      case 'documents':
        return rows(result, 'requests')
            .map(
              (r) => ListTile(
                leading: const Icon(Icons.description_outlined),
                title: Text(text(r['document'])),
                subtitle: Text(text(r['status'])),
              ),
            )
            .toList();
      case 'results':
        return rows(result, 'sheets')
            .map(
              (r) => ListTile(
                leading: const Icon(Icons.school_outlined),
                title: Text(text(r['title'])),
                subtitle: Text(
                  'Média publicada: ${average(r['termAverage'])}\n${text(r['result'])}',
                ),
              ),
            )
            .toList();
      case 'finance':
        return rows(result, 'invoices')
            .map(
              (r) => ExpansionTile(
                title: Text(text(r['label'])),
                subtitle: Text(
                  '${text(r['number'])} · ${text(r['status'])}\nValor base: ${money(r['amountCents'])} · Vencimento: ${text(r['due'])}',
                ),
                children: rows(r, 'receipts')
                    .map(
                      (receipt) => ListTile(
                        title: Text('Recibo ${text(receipt['number'])}'),
                        subtitle: Text(
                          '${money(receipt['amountCents'])} · ${text(receipt['status'])}',
                        ),
                      ),
                    )
                    .toList(),
              ),
            )
            .toList();
      default:
        throw const FormatException('Serviço não suportado.');
    }
  }

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
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  'Não foi possível carregar esta consulta institucional.',
                ),
                TextButton(
                  onPressed: () => setState(reload),
                  child: const Text('Tentar novamente'),
                ),
              ],
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
          padding: const EdgeInsets.all(24),
          children: [
            if (children.isEmpty)
              const Text('Sem registos disponíveis neste contexto.'),
            ...children,
            const SizedBox(height: 24),
            if (widget.collection == 'notifications')
              const Text(
                'Últimos avisos. Não são marcados automaticamente como lidos.',
              ),
            if (widget.collection == 'finance')
              const Text(
                'Consulta de facturas e recibos. Pagamento e reconciliação permanecem no Payflow; valor base não representa saldo em dívida.',
              ),
            if (widget.collection == 'documents')
              const Text(
                'Consulta de pedidos. Novos pedidos são tratados no portal ou na secretaria.',
              ),
          ],
        ),
      );
    },
  );
}
