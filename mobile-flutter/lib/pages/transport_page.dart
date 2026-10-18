import 'package:flutter/material.dart';
import 'package:fluentui_system_icons/fluentui_system_icons.dart';
import 'package:url_launcher/url_launcher.dart';
import '../design/portal.dart';
import '../design/tokens.dart';
import '../design/widgets.dart';
import '../gateway.dart';

const _amber = Color(0xffe8890c);
const _red = Color(0xffd92c3a);
const _green = Color(0xff1f9d55);

/// Estado de hoje da rota: rótulo, cor e ícone.
(String, Color, IconData) transportDayText(Map<String, dynamic>? today) =>
    switch (today?['status']) {
      'delayed' => (
        'Atrasada cerca de ${today!['delayMinutes']} min',
        _amber,
        FluentIcons.clock_alarm_24_filled,
      ),
      'cancelled' => (
        'Sem serviço hoje',
        _red,
        FluentIcons.dismiss_circle_24_filled,
      ),
      _ => ('Horário normal', _green, FluentIcons.checkmark_circle_24_filled),
    };

/// «O meu transporte»: as rotas do aluno em vigor hoje, como estão no
/// SIGA — paragem, horas, viatura, motorista e o estado do dia. Só consulta:
/// mudar de rota ou de paragem pede-se à secretaria, no portal.
class TransportPage extends StatefulWidget {
  const TransportPage({super.key, required this.gateway});
  final MobileGateway gateway;
  @override
  State<TransportPage> createState() => _TransportPageState();
}

class _TransportPageState extends State<TransportPage> with SyncedState {
  late Future<List<Map<String, dynamic>>> routes;

  @override
  void resync() => load();

  @override
  void initState() {
    super.initState();
    load();
  }

  void load() => routes = widget.gateway.transport();

  @override
  Widget build(BuildContext context) => FutureBuilder(
    future: routes,
    builder: (context, snapshot) {
      if (snapshot.connectionState != ConnectionState.done &&
          !snapshot.hasData) {
        return const Center(child: CircularProgressIndicator());
      }
      if (snapshot.hasError) {
        final error = snapshot.error;
        return Center(
          child: EmptyState(
            icon: FluentIcons.vehicle_bus_24_regular,
            message: error is CommandError
                ? error.message
                : 'Não foi possível carregar o transporte.',
            action: 'Tentar novamente',
            onAction: () => setState(load),
          ),
        );
      }
      final list = snapshot.data!;
      final children = <Widget>[
        if (list.isEmpty)
          const Padding(
            padding: EdgeInsets.only(top: Siga.s4),
            child: EmptyState(
              icon: FluentIcons.vehicle_bus_24_regular,
              message: 'Não tem transporte escolar atribuído.',
            ),
          ),
        for (final route in list) ...[
          _DayBanner(route['today'] as Map<String, dynamic>?),
          const SizedBox(height: Siga.s2),
          _RouteCard(route),
          if (route['vehicle'] case final Map<String, dynamic> vehicle) ...[
            const SizedBox(height: Siga.s2),
            _VehicleCard(vehicle),
          ],
          const SizedBox(height: Siga.s3),
        ],
        const PortalHint(
          'Mudar de rota ou de paragem pede-se à secretaria da escola, '
          'no portal SIGA Plus.',
        ),
      ];
      return RefreshIndicator(
        onRefresh: () async {
          setState(load);
          await routes;
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(
            Siga.s3,
            Siga.s2,
            Siga.s3,
            Siga.s4,
          ),
          children: [
            for (final (i, child) in children.indexed)
              Entrance(index: i, child: child),
          ],
        ),
      );
    },
  );
}

class _DayBanner extends StatelessWidget {
  const _DayBanner(this.today);
  final Map<String, dynamic>? today;
  @override
  Widget build(BuildContext context) {
    final (label, color, icon) = transportDayText(today);
    final note = today?['note'];
    return Container(
      padding: const EdgeInsets.all(Siga.s2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: .1),
        borderRadius: BorderRadius.circular(Siga.rMedium),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: 22),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Hoje · $label',
                  style: TextStyle(fontWeight: FontWeight.w700, color: color),
                ),
                if (note is String && note.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(note),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _RouteCard extends StatelessWidget {
  const _RouteCard(this.route);
  final Map<String, dynamic> route;
  @override
  Widget build(BuildContext context) {
    final palette = SigaPalette.of(context);
    final stop = route['stop'] as Map<String, dynamic>;
    final direction = route['direction'];
    final landmark = stop['landmark'];
    final times = [
      if (direction != 'return' && stop['outboundTime'] is String)
        ('Ida', stop['outboundTime'] as String),
      if (direction != 'outbound' && stop['returnTime'] is String)
        ('Volta', stop['returnTime'] as String),
    ];
    return SigaCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              TintIcon(
                FluentIcons.vehicle_bus_24_regular,
                color: Theme.of(context).colorScheme.primary,
                size: 44,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${route['routeName']}',
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(switch (direction) {
                      'outbound' => 'Só ida',
                      'return' => 'Só volta',
                      _ => 'Ida e volta',
                    }, style: TextStyle(color: palette.ink2, fontSize: 13)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: Siga.s2),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                FluentIcons.location_24_regular,
                size: 20,
                color: palette.ink2,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${stop['name']}',
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    Text(
                      'Paragem ${stop['sequence']} de ${route['stopsCount']}'
                      '${landmark is String && landmark.isNotEmpty ? ' · $landmark' : ''}',
                      style: TextStyle(color: palette.ink2, fontSize: 13),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (times.isNotEmpty) ...[
            const SizedBox(height: Siga.s2),
            Row(
              children: [
                for (final (i, (label, time)) in times.indexed) ...[
                  if (i > 0) const SizedBox(width: Siga.s1),
                  Expanded(child: _Time(label, time)),
                ],
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _Time extends StatelessWidget {
  const _Time(this.label, this.time);
  final String label;
  final String time;
  @override
  Widget build(BuildContext context) {
    final palette = SigaPalette.of(context);
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: palette.surface2,
        borderRadius: BorderRadius.circular(Siga.rMedium),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(fontSize: 12, color: palette.ink2)),
          const SizedBox(height: 4),
          Text(
            time,
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}

class _VehicleCard extends StatelessWidget {
  const _VehicleCard(this.vehicle);
  final Map<String, dynamic> vehicle;

  Future<void> call(BuildContext context, String phone) async {
    final uri = Uri(scheme: 'tel', path: phone.replaceAll(' ', ''));
    if (!await launchUrl(uri) && context.mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Ligue para $phone.')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = SigaPalette.of(context);
    final driver = vehicle['driverName'];
    final phone = vehicle['driverPhone'];
    return SigaCard(
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${vehicle['label']} · ${vehicle['plate']}',
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                Text(
                  driver is String
                      ? 'Motorista: $driver'
                      : 'Motorista por indicar',
                  style: TextStyle(color: palette.ink2, fontSize: 13),
                ),
              ],
            ),
          ),
          if (phone is String && phone.isNotEmpty)
            IconButton.filledTonal(
              tooltip: 'Ligar ao motorista',
              onPressed: () => call(context, phone),
              icon: const Icon(FluentIcons.call_24_regular),
            ),
        ],
      ),
    );
  }
}
