import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'design.dart';

/// Gradient squircle with the institutional S, at the proportions of the
/// approved screens. It is a typographic stand-in: the original logo vector
/// and the Rive artboard are still required before brand sign-off.
class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.size = 132, this.glow = true});
  final double size;
  final bool glow;
  @override
  Widget build(BuildContext context) => SizedBox(
    width: size * 1.6,
    height: size * 1.6,
    child: Stack(
      alignment: Alignment.center,
      children: [
        if (glow)
          Container(
            width: size * 1.55,
            height: size * 1.55,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: RadialGradient(
                colors: [
                  Sg.brand[0].withValues(alpha: .20),
                  Sg.brand[1].withValues(alpha: .10),
                  Colors.transparent,
                ],
                stops: const [0, .55, 1],
              ),
            ),
          ),
        Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            gradient: Sg.brandGradient,
            borderRadius: BorderRadius.circular(size * .30),
            boxShadow: [
              BoxShadow(
                color: Sg.brand[1].withValues(alpha: .28),
                blurRadius: size * .28,
                offset: Offset(0, size * .10),
              ),
            ],
          ),
          alignment: Alignment.center,
          child: Text(
            'S',
            style: TextStyle(
              fontSize: size * .62,
              height: 1.1,
              fontWeight: FontWeight.w700,
              color: Colors.white,
              letterSpacing: -1,
            ),
          ),
        ),
      ],
    ),
  );
}

/// «SIGA» in institutional ink and «Plus» in the brand gradient.
class Brand extends StatelessWidget {
  const Brand({super.key, this.size = 28});
  final double size;
  @override
  Widget build(BuildContext context) {
    final style = TextStyle(
      fontSize: size,
      fontWeight: FontWeight.w700,
      letterSpacing: -.6,
    );
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text('SIGA ', style: style.copyWith(color: Sg.of(context).text)),
        ShaderMask(
          shaderCallback: (rect) => Sg.wordmarkGradient.createShader(rect),
          child: Text('Plus', style: style.copyWith(color: Colors.white)),
        ),
      ],
    );
  }
}

/// Soft brand wash behind the opening screens.
class BrandWash extends StatelessWidget {
  const BrandWash({super.key, this.opacity = 1});
  final double opacity;
  @override
  Widget build(BuildContext context) => IgnorePointer(
    child: Opacity(
      opacity: opacity,
      child: Stack(
        children: [
          Positioned(
            top: -90,
            left: -60,
            child: _Blob(color: Sg.brand[0].withValues(alpha: .18), size: 280),
          ),
          Positioned(
            top: 120,
            right: -80,
            child: _Blob(color: Sg.brand[1].withValues(alpha: .14), size: 260),
          ),
          Positioned(
            bottom: -60,
            left: 20,
            child: _Blob(color: Sg.brand[2].withValues(alpha: .12), size: 240),
          ),
        ],
      ),
    ),
  );
}

class _Blob extends StatelessWidget {
  const _Blob({required this.color, required this.size});
  final Color color;
  final double size;
  @override
  Widget build(BuildContext context) => Container(
    width: size,
    height: size,
    decoration: BoxDecoration(
      shape: BoxShape.circle,
      gradient: RadialGradient(colors: [color, color.withValues(alpha: 0)]),
    ),
  );
}

/// Three-segment step indicator at the foot of the opening screens.
class StepBar extends StatelessWidget {
  const StepBar({super.key, required this.steps, required this.progress});
  final int steps;
  final double progress;
  @override
  Widget build(BuildContext context) {
    final palette = Sg.of(context);
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        for (var i = 0; i < steps; i++)
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 3),
            width: 44,
            height: 4,
            decoration: BoxDecoration(
              color: palette.border,
              borderRadius: BorderRadius.circular(Sg.rPill),
            ),
            child: FractionallySizedBox(
              alignment: Alignment.centerLeft,
              widthFactor: (progress * steps - i).clamp(0.0, 1.0),
              child: Container(
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.primary,
                  borderRadius: BorderRadius.circular(Sg.rPill),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

/// Opening sequence: mark, welcome message and mark again. Interim typographic
/// reveal; not an exact morph of the original logo vector.
class IdentityIntro extends StatefulWidget {
  const IdentityIntro({super.key, required this.onDone, this.short = false});
  final VoidCallback onDone;
  final bool short;
  @override
  State<IdentityIntro> createState() => _IdentityIntroState();
}

class _IdentityIntroState extends State<IdentityIntro>
    with SingleTickerProviderStateMixin {
  late final AnimationController motion = AnimationController(
    vsync: this,
    duration: Duration(milliseconds: widget.short ? 650 : 3200),
  );
  bool done = false;
  bool started = false;
  void finish() {
    if (done) return;
    done = true;
    motion.stop();
    widget.onDone();
  }

  @override
  void initState() {
    super.initState();
    motion.addStatusListener((s) {
      if (s == AnimationStatus.completed) finish();
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) finish();
      });
    } else if (!started) {
      started = true;
      motion.forward();
    }
  }

  @override
  void dispose() {
    motion.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final palette = Sg.of(context);
    return Scaffold(
      body: Stack(
        children: [
          const Positioned.fill(child: BrandWash(opacity: .9)),
          SafeArea(
            child: AnimatedBuilder(
              animation: motion,
              builder: (context, _) {
                final t = widget.short ? 0.0 : motion.value;
                // Dilate into the message between 30% and 45%, hold, and
                // contract back to the mark from 70%.
                final reveal = t < .30
                    ? 0.0
                    : t < .45
                    ? (t - .30) / .15
                    : t < .70
                    ? 1.0
                    : t < .85
                    ? 1 - (t - .70) / .15
                    : 0.0;
                final eased = Curves.easeInOutCubic.transform(
                  reveal.clamp(0.0, 1.0),
                );
                return Column(
                  children: [
                    const Spacer(),
                    SizedBox(
                      height: 230,
                      child: Stack(
                        alignment: Alignment.center,
                        children: [
                          Opacity(
                            opacity: 1 - eased,
                            child: Transform.scale(
                              scale:
                                  .92 +
                                  .08 * math.min(motion.value * 5, 1) -
                                  .10 * eased,
                              child: const BrandMark(),
                            ),
                          ),
                          Opacity(
                            opacity: eased,
                            child: Transform.scale(
                              scale: .88 + .12 * eased,
                              child: Semantics(
                                label: 'Seja bem-vindo ao SIGA Plus',
                                child: ExcludeSemantics(
                                  child: Column(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      ShaderMask(
                                        shaderCallback: (rect) => Sg
                                            .wordmarkGradient
                                            .createShader(rect),
                                        child: const Text(
                                          'Seja bem-vindo',
                                          style: TextStyle(
                                            fontSize: 34,
                                            fontWeight: FontWeight.w700,
                                            letterSpacing: -.8,
                                            color: Colors.white,
                                          ),
                                        ),
                                      ),
                                      const SizedBox(height: Sg.gapS),
                                      Text(
                                        'Ao SIGA Plus',
                                        style: Sg.section.copyWith(
                                          color: palette.text,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: Sg.gapL),
                    Opacity(opacity: 1 - eased, child: const Brand(size: 30)),
                    const SizedBox(height: Sg.gap),
                    Text(
                      'Educação que transforma\nem qualquer lugar',
                      textAlign: TextAlign.center,
                      style: Sg.body.copyWith(color: palette.muted),
                    ),
                    const Spacer(),
                    StepBar(
                      steps: 3,
                      progress: widget.short ? 1 : motion.value,
                    ),
                    const SizedBox(height: Sg.gapL),
                  ],
                );
              },
            ),
          ),
          Positioned(
            right: Sg.gapM,
            top: MediaQuery.paddingOf(context).top + Sg.gapS,
            child: TextButton(onPressed: finish, child: const Text('Saltar')),
          ),
        ],
      ),
    );
  }
}

/// Fourth opening screen: what the school gets, with the step dots and the
/// circular advance control of the approved design.
class PresentationPage extends StatelessWidget {
  const PresentationPage({super.key, required this.onDone});
  final VoidCallback onDone;
  static const _highlights = [
    (Icons.school_outlined, 'Ensino'),
    (Icons.search, 'Consulta'),
    (Icons.bar_chart_rounded, 'Gestão'),
    (Icons.groups_outlined, 'Comunidade'),
    (Icons.calendar_month_outlined, 'Calendário'),
  ];
  @override
  Widget build(BuildContext context) {
    final palette = Sg.of(context);
    return Scaffold(
      body: Stack(
        children: [
          const Positioned.fill(child: BrandWash(opacity: .55)),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(Sg.gutter),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Spacer(),
                  Center(
                    child: SizedBox(
                      height: 230,
                      width: 280,
                      child: Stack(
                        children: [
                          for (var i = 0; i < _highlights.length; i++)
                            Positioned(
                              left: const [20.0, 150.0, 96.0, 10.0, 180.0][i],
                              top: const [10.0, 40.0, 92.0, 150.0, 150.0][i],
                              child: Transform.rotate(
                                angle: const [-.06, .08, 0.0, .05, -.07][i],
                                child: _HighlightTile(
                                  icon: _highlights[i].$1,
                                  label: _highlights[i].$2,
                                  seed: _highlights[i].$2,
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                  const Spacer(),
                  Text(
                    'Tudo o que a sua\nescola precisa',
                    style: Sg.display.copyWith(color: palette.text),
                  ),
                  const SizedBox(height: Sg.gap),
                  Text(
                    'Ensino, aprendizagem, comunicação e gestão num só lugar.',
                    style: Sg.body.copyWith(color: palette.muted),
                  ),
                  const SizedBox(height: Sg.gapXl),
                  Row(
                    children: [
                      for (var i = 0; i < 3; i++)
                        Container(
                          margin: const EdgeInsets.only(right: 6),
                          width: i == 0 ? 20 : 7,
                          height: 7,
                          decoration: BoxDecoration(
                            color: i == 0
                                ? Theme.of(context).colorScheme.primary
                                : palette.border,
                            borderRadius: BorderRadius.circular(Sg.rPill),
                          ),
                        ),
                      const Spacer(),
                      SizedBox(
                        width: 56,
                        height: 56,
                        child: FilledButton(
                          onPressed: onDone,
                          style: FilledButton.styleFrom(
                            padding: EdgeInsets.zero,
                            shape: const CircleBorder(),
                            minimumSize: const Size.square(56),
                          ),
                          child: const Icon(Icons.arrow_forward, size: 22),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: Sg.gapS),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _HighlightTile extends StatelessWidget {
  const _HighlightTile({
    required this.icon,
    required this.label,
    required this.seed,
  });
  final IconData icon;
  final String label;
  final String seed;
  @override
  Widget build(BuildContext context) {
    final palette = Sg.of(context);
    return Semantics(
      label: label,
      child: Container(
        width: 84,
        height: 84,
        decoration: BoxDecoration(
          color: palette.canvas,
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: palette.border),
          boxShadow: [
            BoxShadow(
              color: Sg.accent(seed).withValues(alpha: .16),
              blurRadius: 24,
              offset: const Offset(0, 10),
            ),
          ],
        ),
        alignment: Alignment.center,
        child: Icon(icon, size: 30, color: Sg.accent(seed)),
      ),
    );
  }
}
