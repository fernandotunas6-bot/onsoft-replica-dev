import 'package:flutter/material.dart';
import '../design/tokens.dart';
import '../design/widgets.dart';

/// Partes do módulo de transporte, por ordem de implementação.
const transportParts = [
  ('Rotas e paragens', 'Percursos de ida e volta, com a ordem das paragens'),
  ('Veículos e motoristas', 'Cada rota com o seu autocarro e responsável'),
  ('Alunos autorizados', 'Quem viaja em cada rota, autorizado pela escola'),
  ('Embarque e desembarque', 'Registo à entrada e à saída do autocarro'),
  ('Notificações', 'Aviso ao encarregado no embarque e na chegada'),
  ('Histórico e relatórios', 'Viagens anteriores, atrasos e ocorrências'),
];

/// Transporte escolar — prévia do módulo.
///
/// Ainda não há rotas, veículos nem GPS no SIGA Plus. O trajecto é
/// ilustrativo e está marcado como «Simulação»; não se lê nem inventa
/// localização e não há botões para acções que ainda não existem.
class TransportPage extends StatelessWidget {
  const TransportPage({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final palette = SigaPalette.of(context);
    return ListView(
      padding: const EdgeInsets.all(Siga.s3),
      children: [
        SigaCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const IconBadge(Icons.directions_bus_outlined, accent: true),
                  const SizedBox(width: Siga.s2),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Rota escolar 01',
                          style: theme.textTheme.titleMedium,
                        ),
                        Text(
                          'Acompanhamento do percurso',
                          style: theme.textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                  const StatusTag('Simulação'),
                ],
              ),
              const SizedBox(height: Siga.s2),
              Container(
                padding: const EdgeInsets.all(Siga.s2),
                decoration: BoxDecoration(
                  color: palette.surface2,
                  borderRadius: BorderRadius.circular(Siga.rLarge),
                ),
                child: Column(
                  children: [
                    Semantics(
                      image: true,
                      label: 'Trajecto ilustrativo da rota',
                      child: AspectRatio(
                        aspectRatio: 320 / 150,
                        child: CustomPaint(
                          painter: RoutePainter(
                            done: theme.colorScheme.primary,
                            ink: theme.colorScheme.onSurface,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: Siga.s1),
                    Text(
                      'Trajecto ilustrativo, sem localização GPS real',
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: Siga.s2),
              Row(
                children: [
                  Expanded(child: _Stat('Próxima paragem', 'Paragem B')),
                  const SizedBox(width: Siga.s1),
                  Expanded(child: _Stat('Estado', 'A aguardar GPS')),
                ],
              ),
              const SizedBox(height: Siga.s2),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    Icons.verified_user_outlined,
                    size: 18,
                    color: palette.ink2,
                  ),
                  const SizedBox(width: Siga.s1),
                  Expanded(
                    child: Text(
                      'A localização real só estará disponível após '
                      'autorização da escola, integração com dispositivos GPS '
                      'e activação da rota.',
                      style: theme.textTheme.bodySmall,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SectionHeader('O que o módulo vai ter'),
        for (final (title, detail) in transportParts)
          ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: Siga.s1),
            leading: const Icon(Icons.check, size: 20),
            title: Text(
              title,
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
            subtitle: Text(detail),
          ),
        const SizedBox(height: Siga.s2),
        Text(
          'Os encarregados verão apenas os trajectos dos seus educandos '
          'autorizados. As permissões são decididas no servidor da escola, '
          'não nesta aplicação.',
          style: theme.textTheme.bodySmall,
        ),
      ],
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat(this.label, this.value);
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) {
    final palette = SigaPalette.of(context);
    return Container(
      padding: const EdgeInsets.all(Siga.s2),
      decoration: BoxDecoration(
        color: palette.surface2,
        borderRadius: BorderRadius.circular(Siga.rMedium),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 6),
          Text(value, style: Theme.of(context).textTheme.titleMedium),
        ],
      ),
    );
  }
}

/// Desenho do trajecto ilustrativo: percorrido a cheio, por percorrer a
/// tracejado, o autocarro a meio e o destino a verde.
class RoutePainter extends CustomPainter {
  RoutePainter({required this.done, required this.ink});
  final Color done;
  final Color ink;

  @override
  void paint(Canvas canvas, Size size) {
    final sx = size.width / 320;
    final sy = size.height / 150;
    Offset p(double x, double y) => Offset(x * sx, y * sy);

    final grid = Paint()
      ..color = ink.withValues(alpha: .07)
      ..strokeWidth = 1;
    for (final y in [30.0, 60.0, 90.0, 120.0]) {
      canvas.drawLine(p(0, y), p(320, y), grid);
    }
    for (final x in [40.0, 80.0, 120.0, 160.0, 200.0, 240.0, 280.0]) {
      canvas.drawLine(p(x, 0), p(x, 150), grid);
    }

    final travelled = Path()
      ..moveTo(30 * sx, 118 * sy)
      ..cubicTo(80 * sx, 100 * sy, 100 * sx, 60 * sy, 140 * sx, 62 * sy)
      ..cubicTo(160 * sx, 63 * sy, 170 * sx, 80 * sy, 180 * sx, 76 * sy);
    canvas.drawPath(
      travelled,
      Paint()
        ..color = done
        ..style = PaintingStyle.stroke
        ..strokeWidth = 5
        ..strokeCap = StrokeCap.round,
    );

    final ahead = Path()
      ..moveTo(180 * sx, 76 * sy)
      ..cubicTo(210 * sx, 66 * sy, 220 * sx, 30 * sy, 250 * sx, 26 * sy)
      ..cubicTo(270 * sx, 24 * sy, 285 * sx, 40 * sy, 292 * sx, 48 * sy);
    final dash = Paint()
      ..color = ink.withValues(alpha: .35)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4
      ..strokeCap = StrokeCap.round;
    for (final metric in ahead.computeMetrics()) {
      for (var d = 0.0; d < metric.length; d += 11) {
        canvas.drawPath(metric.extractPath(d, d + 2), dash);
      }
    }

    canvas.drawCircle(
      p(30, 118),
      6 * sx,
      Paint()..color = ink.withValues(alpha: .35),
    );
    canvas.drawCircle(
      p(292, 48),
      7 * sx,
      Paint()..color = const Color(0xff16a34a),
    );
    canvas.drawCircle(
      p(180, 76),
      15 * sx,
      Paint()..color = done.withValues(alpha: .18),
    );
    canvas.drawCircle(p(180, 76), 8 * sx, Paint()..color = done);
    canvas.drawCircle(p(180, 76), 3 * sx, Paint()..color = Colors.white);
  }

  @override
  bool shouldRepaint(RoutePainter old) => old.done != done || old.ink != ink;
}
