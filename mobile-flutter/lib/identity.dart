import 'dart:ui' show ImageFilter, lerpDouble;
import 'package:flutter/material.dart';
import 'design/tokens.dart';

/// Marca SIGA Plus: «SIGA» em preto suave e «Plus» com o gradiente da
/// identidade — o único sítio, além do «S», onde o gradiente aparece.
class Brand extends StatelessWidget {
  const Brand({super.key, this.size = 28});
  final double size;
  @override
  Widget build(BuildContext context) {
    final style = TextStyle(
      fontSize: size,
      fontWeight: FontWeight.w800,
      letterSpacing: -size * .03,
      color: Theme.of(context).colorScheme.onSurface,
    );
    return Semantics(
      label: 'SIGA Plus',
      child: ExcludeSemantics(
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('SIGA ', style: style),
            GradientText('Plus', style: style),
          ],
        ),
      ),
    );
  }
}

/// Texto pintado com o gradiente da marca.
class GradientText extends StatelessWidget {
  const GradientText(this.text, {super.key, required this.style});
  final String text;
  final TextStyle style;
  @override
  Widget build(BuildContext context) => ShaderMask(
    blendMode: BlendMode.srcIn,
    shaderCallback: const LinearGradient(
      colors: [Color(0xffff3d8b), Color(0xffb04dff), Color(0xff6a5cff)],
    ).createShader,
    child: Text(text, style: style),
  );
}

/// O «S» da identidade num mosaico com o gradiente da marca.
class SigaMark extends StatelessWidget {
  const SigaMark({super.key, this.size = 40});
  final double size;
  @override
  Widget build(BuildContext context) => MorphingMark(reveal: 0, size: size);
}

/// Intervalos da abertura, em fracções da duração total.
class IntroTimeline {
  const IntroTimeline._({
    required this.duration,
    required this.enter,
    required this.expand,
    required this.contract,
    required this.leave,
  });

  /// Primeira abertura (ecrãs 1–3): logótipo → o S dilata e revela «Seja
  /// bem-vindo» → a mensagem encolhe de volta ao S → app. 3,3 s.
  static const full = IntroTimeline._(
    duration: Duration(milliseconds: 3300),
    enter: (0, .15),
    expand: (.22, .42),
    contract: (.62, .8),
    leave: (.9, 1),
  );

  /// Aberturas seguintes: só o logótipo. 1,2 s.
  static const short = IntroTimeline._(
    duration: Duration(milliseconds: 1200),
    enter: (0, .35),
    expand: null,
    contract: null,
    leave: (.75, 1),
  );

  final Duration duration;
  final (double, double) enter;
  final (double, double)? expand;
  final (double, double)? contract;
  final (double, double) leave;

  static double _part(double t, (double, double) range) => Siga.ease.transform(
    ((t - range.$1) / (range.$2 - range.$1)).clamp(0.0, 1.0),
  );

  double entered(double t) => _part(t, enter);

  /// Quanto o S está dilatado (0 = logótipo, 1 = «Seja bem-vindo»).
  double reveal(double t) {
    final open = expand;
    final close = contract;
    if (open == null || close == null) return 0;
    return _part(t, open) - _part(t, close);
  }

  double left(double t) => _part(t, leave);
}

/// Abertura de identidade: o «S» do logótipo dilata-se, revela «Seja
/// bem-vindo», encolhe de volta ao S e a app abre. Uma só animação contínua,
/// sem troca de imagens. Pode saltar-se, não corre com movimento reduzido e
/// não espera pela sessão (que carrega em paralelo).
class IdentityIntro extends StatefulWidget {
  const IdentityIntro({super.key, required this.onDone, this.short = false});
  final VoidCallback onDone;
  final bool short;
  @override
  State<IdentityIntro> createState() => _IdentityIntroState();
}

class _IdentityIntroState extends State<IdentityIntro>
    with SingleTickerProviderStateMixin {
  late final IntroTimeline timeline = widget.short
      ? IntroTimeline.short
      : IntroTimeline.full;
  late final AnimationController motion = AnimationController(
    vsync: this,
    duration: timeline.duration,
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
    final ink2 = Theme.of(context).colorScheme.onSurfaceVariant;
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Stack(
          children: [
            Positioned.fill(
              child: Semantics(
                liveRegion: true,
                label: 'Seja bem-vindo ao SIGA Plus',
                child: ExcludeSemantics(
                  child: AnimatedBuilder(
                    animation: motion,
                    builder: (context, _) {
                      final t = motion.value;
                      return Opacity(
                        opacity: 1 - timeline.left(t),
                        child: IntroFrame(
                          enter: timeline.entered(t),
                          reveal: timeline.reveal(t),
                          progress: t,
                        ),
                      );
                    },
                  ),
                ),
              ),
            ),
            Positioned(
              top: Siga.s1,
              right: Siga.s1,
              child: TextButton(
                onPressed: finish,
                style: TextButton.styleFrom(
                  foregroundColor: ink2,
                  minimumSize: const Size(64, 44),
                ),
                child: const Text('Saltar'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Um instante da abertura: brilho de fundo, o S, os textos e a barra de
/// progresso. [reveal] vai do logótipo (0) à mensagem (1).
class IntroFrame extends StatelessWidget {
  const IntroFrame({
    super.key,
    required this.enter,
    required this.reveal,
    required this.progress,
  });
  final double enter;
  final double reveal;
  final double progress;

  @override
  Widget build(BuildContext context) {
    final r = reveal.clamp(0.0, 1.0);
    final ink2 = Theme.of(context).colorScheme.onSurfaceVariant;
    const tagline = 'Educação que transforma\nem qualquer lugar';
    return Stack(
      alignment: Alignment.center,
      children: [
        // Halo suave por trás do S, como nas referências.
        Positioned.fill(
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: RadialGradient(
                center: const Alignment(0, -.32),
                radius: .55 + .35 * r,
                colors: [
                  Color.lerp(
                    const Color(0x1aff5fa8),
                    const Color(0x33c86bff),
                    r,
                  )!,
                  const Color(0x00ffffff),
                ],
              ),
            ),
          ),
        ),
        Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            SizedBox(
              height: 300,
              child: Center(
                child: Opacity(
                  opacity: enter,
                  child: Transform.scale(
                    scale: (.7 + .3 * enter) * lerpDouble(1, 2.1, r)!,
                    child: MorphingMark(reveal: r, size: 132),
                  ),
                ),
              ),
            ),
            SizedBox(
              height: 150,
              child: Stack(
                alignment: Alignment.topCenter,
                children: [
                  Opacity(
                    opacity: enter * (1 - r),
                    child: Transform.translate(
                      offset: Offset(0, 10 * r),
                      child: Column(
                        children: [
                          const Brand(size: 34),
                          const SizedBox(height: Siga.s2),
                          Text(
                            tagline,
                            textAlign: TextAlign.center,
                            style: TextStyle(fontSize: 16, color: ink2),
                          ),
                        ],
                      ),
                    ),
                  ),
                  Opacity(
                    opacity: r,
                    child: Transform.translate(
                      offset: Offset(0, 10 * (1 - r)),
                      child: Column(
                        children: [
                          const GradientText(
                            'Seja bem-vindo',
                            style: TextStyle(
                              fontSize: 32,
                              fontWeight: FontWeight.w800,
                              letterSpacing: -.8,
                            ),
                          ),
                          const SizedBox(height: Siga.s1),
                          Text(
                            'Ao SIGA Plus',
                            style: TextStyle(
                              fontSize: 19,
                              fontWeight: FontWeight.w700,
                              color: Theme.of(context).colorScheme.onSurface,
                            ),
                          ),
                          const SizedBox(height: Siga.s1),
                          Text(
                            tagline,
                            textAlign: TextAlign.center,
                            style: TextStyle(fontSize: 14, color: ink2),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        // Barra de progresso no fundo, como nos ecrãs 1–3.
        Positioned(
          bottom: Siga.s4,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(2),
            child: SizedBox(
              width: 90,
              height: 3,
              child: LinearProgressIndicator(
                value: progress.clamp(0.0, 1.0),
                backgroundColor: const Color(0xffe6e8ee),
                color: Siga.institutionalBlue,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// O S da marca. Com [reveal] = 0 é o mosaico do logótipo (S branco sobre o
/// gradiente); a dilatar, o mosaico desvanece e o próprio S passa a ser o
/// gradiente, maior e suave — o «remoinho» do ecrã 2.
class MorphingMark extends StatelessWidget {
  const MorphingMark({super.key, required this.reveal, this.size = 104});
  final double reveal;
  final double size;
  @override
  Widget build(BuildContext context) {
    final r = reveal.clamp(0.0, 1.0);
    final glyph = TextStyle(
      fontSize: size * .66,
      fontWeight: FontWeight.w800,
      height: 1,
      letterSpacing: 0,
      color: Colors.white,
    );
    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        alignment: Alignment.center,
        children: [
          // Mosaico do logótipo, com brilho no topo.
          Opacity(
            opacity: 1 - r,
            child: Container(
              decoration: BoxDecoration(
                gradient: Siga.brand,
                borderRadius: BorderRadius.circular(size * .3),
                boxShadow: [
                  BoxShadow(
                    color: const Color(
                      0x55b04dff,
                    ).withValues(alpha: .3 * (1 - r)),
                    blurRadius: size * .4,
                    offset: Offset(0, size * .12),
                  ),
                ],
              ),
              foregroundDecoration: BoxDecoration(
                borderRadius: BorderRadius.circular(size * .3),
                gradient: const LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.center,
                  colors: [Color(0x40ffffff), Color(0x00ffffff)],
                ),
              ),
            ),
          ),
          // O S: branco no mosaico, gradiente quando dilata.
          ImageFiltered(
            imageFilter: ImageFilter.blur(sigmaX: 6 * r, sigmaY: 6 * r),
            child: Stack(
              alignment: Alignment.center,
              children: [
                Opacity(
                  opacity: 1 - r,
                  child: Text('S', style: glyph),
                ),
                Opacity(
                  opacity: r,
                  child: ShaderMask(
                    blendMode: BlendMode.srcIn,
                    shaderCallback: Siga.brand.createShader,
                    child: Text('S', style: glyph),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
