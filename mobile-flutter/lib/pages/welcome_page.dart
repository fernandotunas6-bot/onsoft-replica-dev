import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../design/tokens.dart';

/// Páginas da apresentação: o que a aplicação faz, sem prometer integrações.
const welcomeSlides = [
  (
    'Tudo o que a sua escola precisa',
    'Ensino, aprendizagem, comunicação e gestão num só lugar.',
    [
      LucideIcons.graduationCap,
      Icons.bar_chart_rounded,
      LucideIcons.users,
      LucideIcons.calendarDays,
    ],
  ),
  (
    'A sua turma, organizada',
    'Disciplinas, tarefas e horários de cada turma, num espaço de '
        'aprendizagem como o do Moodle.',
    [
      LucideIcons.bookOpen,
      LucideIcons.clipboardCheck,
      LucideIcons.clock,
      LucideIcons.messageCircle,
    ],
  ),
  (
    'Cada escola, os seus dados',
    'Entra com a conta institucional e escolhe a escola. O acesso é decidido '
        'pelo servidor da escola, conforme o seu perfil.',
    [
      LucideIcons.shieldCheck,
      LucideIcons.building2,
      LucideIcons.idCard,
      LucideIcons.lockKeyhole,
    ],
  ),
];

/// Apresentação mostrada uma vez, depois da abertura do S. Pode saltar-se e
/// não espera pela sessão.
class WelcomePage extends StatefulWidget {
  const WelcomePage({super.key, required this.onDone});
  final VoidCallback onDone;
  @override
  State<WelcomePage> createState() => _WelcomePageState();
}

class _WelcomePageState extends State<WelcomePage> {
  final controller = PageController();
  int index = 0;

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  void next() {
    if (index == welcomeSlides.length - 1) {
      widget.onDone();
      return;
    }
    controller.nextPage(
      duration: Siga.motion(context, Siga.medium),
      curve: Siga.ease,
    );
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final palette = SigaPalette.of(context);
    final last = index == welcomeSlides.length - 1;
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Align(
              alignment: Alignment.centerRight,
              child: Padding(
                padding: const EdgeInsets.all(Siga.s1),
                child: TextButton(
                  onPressed: widget.onDone,
                  style: TextButton.styleFrom(foregroundColor: palette.ink2),
                  child: const Text('Saltar'),
                ),
              ),
            ),
            Expanded(
              child: PageView(
                controller: controller,
                onPageChanged: (value) => setState(() => index = value),
                children: [
                  for (final (title, body, icons) in welcomeSlides)
                    _Slide(title: title, body: body, icons: icons),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                Siga.s3,
                Siga.s2,
                Siga.s3,
                Siga.s3,
              ),
              child: Row(
                children: [
                  Semantics(
                    label: 'Página ${index + 1} de ${welcomeSlides.length}',
                    excludeSemantics: true,
                    child: Row(
                      children: [
                        for (var i = 0; i < welcomeSlides.length; i++)
                          AnimatedContainer(
                            duration: Siga.motion(context, Siga.quick),
                            margin: const EdgeInsets.only(right: 8),
                            width: 7,
                            height: 7,
                            decoration: BoxDecoration(
                              color: i == index
                                  ? scheme.primary
                                  : const Color(0xffd5d8df),
                              shape: BoxShape.circle,
                            ),
                          ),
                      ],
                    ),
                  ),
                  const Spacer(),
                  if (last)
                    FilledButton(
                      onPressed: next,
                      style: FilledButton.styleFrom(
                        minimumSize: const Size(140, 52),
                      ),
                      child: const Text('Começar'),
                    )
                  else
                    IconButton.filled(
                      tooltip: 'Seguinte',
                      onPressed: next,
                      style: IconButton.styleFrom(
                        backgroundColor: scheme.onSurface,
                        foregroundColor: scheme.surface,
                        minimumSize: const Size(52, 52),
                      ),
                      icon: const Icon(LucideIcons.arrowRight),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Slide extends StatelessWidget {
  const _Slide({required this.title, required this.body, required this.icons});
  final String title;
  final String body;
  final List<IconData> icons;
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: Siga.s3),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          ExcludeSemantics(
            child: SizedBox(
              width: 240,
              height: 220,
              child: Stack(
                children: [
                  for (final (i, (dx, dy, size)) in const [
                    (10.0, 0.0, 78.0),
                    (100.0, 46.0, 92.0),
                    (0.0, 104.0, 74.0),
                    (124.0, 150.0, 58.0),
                  ].indexed)
                    Positioned(
                      left: dx,
                      top: dy,
                      child: _Tile(
                        icon: icons[i],
                        size: size,
                        color: i == 2
                            ? const Color(0xff7b5cff)
                            : Siga.institutionalBlue,
                      ),
                    ),
                  const Positioned(
                    right: 0,
                    top: 0,
                    child: _Tile(
                      icon: LucideIcons.search,
                      size: 44,
                      color: Siga.institutionalBlue,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: Siga.s4),
          Semantics(
            header: true,
            child: Text(
              title,
              textAlign: TextAlign.center,
              style: theme.textTheme.headlineSmall,
            ),
          ),
          const SizedBox(height: Siga.s1),
          Text(
            body,
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyMedium,
          ),
        ],
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({required this.icon, required this.size, required this.color});
  final IconData icon;
  final double size;
  final Color color;
  @override
  Widget build(BuildContext context) => Container(
    width: size,
    height: size,
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(size * .26),
      boxShadow: const [
        BoxShadow(
          color: Color(0x1a2f3a66),
          blurRadius: 28,
          offset: Offset(0, 10),
        ),
      ],
    ),
    child: ShaderMask(
      blendMode: BlendMode.srcIn,
      shaderCallback: LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [color, Color.lerp(color, const Color(0xff9b5cf6), .5)!],
      ).createShader,
      child: Icon(icon, size: size * .46, color: Colors.white),
    ),
  );
}
