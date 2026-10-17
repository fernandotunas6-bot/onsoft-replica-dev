import 'package:flutter/material.dart';
import 'academic.dart' show luandaClock;
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

  /// Avisos mais antigos já carregados e o cursor da página seguinte.
  final older = <Map<String, dynamic>>[];
  Map<String, dynamic>? cursor;
  bool loadingMore = false;

  Future<void> loadOlder(Map<String, dynamic> before) async {
    setState(() => loadingMore = true);
    try {
      final page = await widget.gateway.olderNotices(before);
      if (!mounted) return;
      setState(() {
        older.addAll(rows(page, 'items'));
        cursor = page['next'] is Map<String, dynamic>
            ? page['next'] as Map<String, dynamic>
            : <String, dynamic>{};
      });
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.maybeOf(context)?.showSnackBar(
          const SnackBar(
            content: Text('Não foi possível carregar mais avisos.'),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => loadingMore = false);
    }
  }

  /// Quando foi: «há 5 min», «hoje às 09:30», «ontem às 15:00», «12/10».
  String when(dynamic iso) {
    final parsed = iso is String ? DateTime.tryParse(iso) : null;
    if (parsed == null) return '';
    final diff = DateTime.now().difference(parsed);
    if (diff.inMinutes < 60 && !diff.isNegative) {
      return diff.inMinutes < 1 ? 'agora mesmo' : 'há ${diff.inMinutes} min';
    }
    final local = luandaClock(parsed);
    final today = luandaClock(DateTime.now());
    final days = DateTime(
      today.year,
      today.month,
      today.day,
    ).difference(DateTime(local.year, local.month, local.day)).inDays;
    final hour =
        '${local.hour.toString().padLeft(2, '0')}:'
        '${local.minute.toString().padLeft(2, '0')}';
    return switch (days) {
      0 => 'hoje às $hour',
      1 => 'ontem às $hour',
      _ => '${local.day}/${local.month}/${local.year}',
    };
  }

  /// Grupo de um aviso pela data (Luanda): 0 hoje, 1 esta semana, 2 antes.
  int age(dynamic iso) {
    final parsed = iso is String ? DateTime.tryParse(iso) : null;
    if (parsed == null) return 2;
    final local = luandaClock(parsed);
    final today = luandaClock(DateTime.now());
    final days = DateTime(
      today.year,
      today.month,
      today.day,
    ).difference(DateTime(local.year, local.month, local.day)).inDays;
    return days <= 0 ? 0 : (days < 7 ? 1 : 2);
  }

  /// AAAA-MM-DD → 10/9/2026.
  String shortDate(dynamic date) {
    final parsed = date is String ? DateTime.tryParse(date) : null;
    return parsed == null
        ? text(date)
        : '${parsed.day}/${parsed.month}/${parsed.year}';
  }

  /// Vencimento de uma factura (AAAA-MM-DD) em relação a hoje, em Luanda.
  (String, bool) dueIn(dynamic date) {
    final parsed = date is String ? DateTime.tryParse(date) : null;
    if (parsed == null) return ('Sem vencimento indicado', false);
    final today = luandaClock(DateTime.now());
    final days = DateTime(
      parsed.year,
      parsed.month,
      parsed.day,
    ).difference(DateTime(today.year, today.month, today.day)).inDays;
    return switch (days) {
      < -1 => ('Venceu há ${-days} dias', true),
      -1 => ('Venceu ontem', true),
      0 => ('Vence hoje', true),
      1 => ('Vence amanhã', false),
      _ => ('Vence em $days dias · ${parsed.day}/${parsed.month}', false),
    };
  }

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
    older.clear();
    cursor = null;
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
        final first = rows(result, 'items');
        final next =
            cursor ??
            (result['next'] is Map<String, dynamic>
                ? result['next'] as Map<String, dynamic>
                : null);
        final items = [...first, ...older];
        bool unread(Map<String, dynamic> r) =>
            r['read'] == false && !readNow.contains(r['id']);
        const groups = ['Hoje', 'Esta semana', 'Anteriores'];
        return [
          if (items.any(unread))
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: () => markRead(null),
                child: const Text('Marcar todas como lidas'),
              ),
            ),
          for (var g = 0; g < groups.length; g++)
            if (items.where((r) => age(r['createdAt']) == g).toList()
                case final list when list.isNotEmpty) ...[
              SectionHeader(groups[g]),
              for (final r in list)
                record(
                  icon: unread(r)
                      ? FluentIcons.alert_badge_24_regular
                      : FluentIcons.alert_24_regular,
                  title: text(r['title']),
                  lines: [
                    text(r['body']),
                    if (when(r['createdAt']).isNotEmpty) when(r['createdAt']),
                  ],
                  status: unread(r) ? 'Novo' : null,
                  highlight: unread(r),
                  onTap: unread(r) && r['id'] is String
                      ? () => markRead([r['id'] as String])
                      : null,
                ),
            ],
          if (next != null && next.isNotEmpty)
            Center(
              child: TextButton(
                onPressed: loadingMore ? null : () => loadOlder(next),
                child: Text(
                  loadingMore ? 'A carregar…' : 'Ver avisos anteriores',
                ),
              ),
            ),
        ];
      case 'documents':
        final requests = rows(result, 'requests');
        const done = {'fulfilled', 'rejected', 'cancelled'};
        final available = [
          for (final d in (result['available'] as List? ?? []))
            if (d is Map && d['name'] is String) d['name'] as String,
        ];
        String day(dynamic iso) {
          final d = iso is String ? DateTime.tryParse(iso) : null;
          return d == null ? '' : '${d.day}/${d.month}/${d.year}';
        }

        Widget card(Map<String, dynamic> r) => record(
          icon: FluentIcons.document_text_24_regular,
          title: text(r['document']),
          lines: [
            if (r['details'] is String && (r['details'] as String).isNotEmpty)
              r['details'] as String,
            [
              if (day(r['requestedAt']).isNotEmpty)
                'Pedido a ${day(r['requestedAt'])}',
              if (day(r['updatedAt']).isNotEmpty &&
                  r['updatedAt'] != r['requestedAt'])
                'actualizado a ${day(r['updatedAt'])}',
            ].join(' · '),
          ].where((l) => l.isNotEmpty).toList(),
          status: label(documentStatusLabels, r['status']),
          highlight: r['status'] == 'approved',
        );
        final active = requests.where((r) => !done.contains(r['status']));
        final closed = requests.where((r) => done.contains(r['status']));
        return [
          if (active.isNotEmpty) ...[
            const SectionHeader('Em curso'),
            for (final r in active) card(r),
          ],
          if (closed.isNotEmpty) ...[
            const SectionHeader('Concluídos'),
            for (final r in closed) card(r),
          ],
          if (available.isNotEmpty) ...[
            const SectionHeader('Pode pedir no portal'),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final name in available)
                  Chip(
                    label: Text(name),
                    side: BorderSide.none,
                    backgroundColor: SigaPalette.of(context).surface2,
                  ),
              ],
            ),
          ],
        ];
      case 'results':
        return [for (final r in rows(result, 'sheets')) resultCard(r)];
      case 'finance':
        final invoices = rows(result, 'invoices');
        Widget invoice(Map<String, dynamic> r) => record(
          icon: FluentIcons.wallet_24_regular,
          title: text(r['label']),
          lines: [
            'Factura ${text(r['number'])} · '
                '${{'paid', 'cancelled'}.contains(r['status']) ? 'vencia a ${shortDate(r['due'])}' : dueIn(r['due']).$1}',
            'Valor base: ${money(r['amountCents'])}',
          ],
          status: label(invoiceStatusLabels, r['status']),
          highlight: r['status'] == 'open' || r['status'] == 'partially_paid',
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
        );
        const unpaid = {'open', 'partially_paid'};
        final open = invoices.where((r) => unpaid.contains(r['status']));
        final paid = invoices.where((r) => r['status'] == 'paid');
        final other = invoices.where(
          (r) => !unpaid.contains(r['status']) && r['status'] != 'paid',
        );
        return [
          if (open.isNotEmpty) ...[
            SectionHeader('Por pagar (${open.length})'),
            for (final r in open) invoice(r),
          ],
          if (paid.isNotEmpty) ...[
            SectionHeader('Pagas (${paid.length})'),
            for (final r in paid) invoice(r),
          ],
          if (other.isNotEmpty) ...[
            const SectionHeader('Anuladas'),
            for (final r in other) invoice(r),
          ],
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
