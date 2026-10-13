import 'package:flutter/material.dart';
import '../design/tokens.dart';

/// Páginas da apresentação: o que a aplicação faz, sem prometer integrações.
const welcomeSlides = [
  (
    'Tudo o que a sua escola precisa',
    'Ensino, aprendizagem, comunicação e gestão num só lugar.',
    [
      Icons.school_outlined,
      Icons.insights_outlined,
      Icons.groups_outlined,
      Icons.calendar_month_outlined,
    ],
  ),
  (
    'A sua turma, organizada',
    'Disciplinas, tarefas e horários de cada turma, num espaço de '
        'aprendizagem como o do Moodle.',
    [
      Icons.menu_book_outlined,
      Icons.assignment_turned_in_outlined,
      Icons.schedule,
      Icons.chat_bubble_outline,
    ],
  ),
  (
    'Cada escola, os seus dados',
    'Entra com a conta institucional e escolhe a escola. O acesso é decidido '
        'pelo servidor da escola, conforme o seu perfil.',
    [
      Icons.verified_user_outlined,
      Icons.apartment_outlined,
      Icons.badge_outlined,
      Icons.lock_outline,
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
                            margin: const EdgeInsets.only(right: 6),
                            width: i == index ? 22 : 8,
                            height: 8,
                            decoration: BoxDecoration(
                              color: i == index ? scheme.primary : palette.line,
                              borderRadius: BorderRadius.circular(4),
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
                      icon: const Icon(Icons.arrow_forward),
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
              width: 220,
              height: 200,
              child: Stack(
                children: [
                  for (final (i, (dx, dy, size)) in const [
                    (0.0, 0.0, 76.0),
                    (120.0, 20.0, 92.0),
                    (14.0, 110.0, 84.0),
                    (136.0, 124.0, 64.0),
                  ].indexed)
                    Positioned(
                      left: dx,
                      top: dy,
                      child: _Tile(icon: icons[i], size: size, accent: i == 1),
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
  const _Tile({required this.icon, required this.size, required this.accent});
  final IconData icon;
  final double size;
  final bool accent;
  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final palette = SigaPalette.of(context);
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: accent ? palette.accentSoft : scheme.surface,
        borderRadius: BorderRadius.circular(size * .28),
        border: Border.all(color: palette.line),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0f141824),
            blurRadius: 24,
            offset: Offset(0, 8),
          ),
        ],
      ),
      child: Icon(
        icon,
        size: size * .4,
        color: accent ? scheme.primary : scheme.onSurface,
      ),
    );
  }
}
