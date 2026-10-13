import 'dart:ui' show lerpDouble;
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
            ShaderMask(
              blendMode: BlendMode.srcIn,
              shaderCallback: Siga.brand.createShader,
              child: Text('Plus', style: style),
            ),
          ],
        ),
      ),
    );
  }
}

/// O «S» da identidade num mosaico com o gradiente da marca.
class SigaMark extends StatelessWidget {
  const SigaMark({super.key, this.size = 40});
  final double size;
  @override
  Widget build(BuildContext context) => Container(
    width: size,
    height: size,
    alignment: Alignment.center,
    decoration: BoxDecoration(
      gradient: Siga.brand,
      borderRadius: BorderRadius.circular(size * .3),
    ),
    child: Text(
      'S',
      style: TextStyle(
        color: Colors.white,
        fontSize: size * .58,
        fontWeight: FontWeight.w800,
        height: 1,
      ),
    ),
  );
}

/// Intervalos da abertura, em fracções da duração total.
class IntroTimeline {
  const IntroTimeline._({
    required this.duration,
    required this.enter,
    required this.expand,
    required this.contract,
    required this.brand,
    required this.leave,
  });

  /// Primeira abertura: S → «Seja bem-vindo» → S → marca. 3,3 s.
  static const full = IntroTimeline._(
    duration: Duration(milliseconds: 3300),
    enter: (0, .16),
    expand: (.16, .36),
    contract: (.58, .75),
    brand: (.75, .88),
    leave: (.88, 1),
  );

  /// Aberturas seguintes: só o S e a marca. 1,2 s.
  static const short = IntroTimeline._(
    duration: Duration(milliseconds: 1200),
    enter: (0, .3),
    expand: null,
    contract: null,
    brand: (.3, .7),
    leave: (.72, 1),
  );

  final Duration duration;
  final (double, double) enter;
  final (double, double)? expand;
  final (double, double)? contract;
  final (double, double) brand;
  final (double, double) leave;

  static double _part(double t, (double, double) range) => Siga.ease.transform(
    ((t - range.$1) / (range.$2 - range.$1)).clamp(0.0, 1.0),
  );

  double entered(double t) => _part(t, enter);

  /// Quanto da mensagem está aberta (0 = só o S, 1 = «Seja bem-vindo»).
  double reveal(double t) {
    final open = expand;
    final close = contract;
    if (open == null || close == null) return 0;
    return _part(t, open) - _part(t, close);
  }

  double branded(double t) => _part(t, brand);
  double left(double t) => _part(t, leave);
}

/// Abertura de identidade: o «S» do logótipo desdobra-se em «Seja bem-vindo»,
/// recolhe-se de novo no «S» e encaixa na marca SIGA Plus.
///
/// A transformação é contínua: «Seja» começa pelo mesmo «S», que nunca sai do
/// lugar; o resto da mensagem abre e fecha a partir dele, e o mosaico estica
/// até ser uma cápsula e volta. Não há troca de imagens. Pode saltar-se, não
/// corre com movimento reduzido e não espera pela sessão (que carrega em
/// paralelo).
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
                      final enter = timeline.entered(t);
                      final brand = timeline.branded(t);
                      final leave = timeline.left(t);
                      return Opacity(
                        opacity: 1 - leave,
                        child: Transform.scale(
                          scale: 1 + .015 * leave,
                          child: Center(
                            child: Transform.translate(
                              offset: Offset(0, 28 * (1 - brand)),
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Opacity(
                                    opacity: enter,
                                    child: Transform.scale(
                                      scale:
                                          (.62 + .38 * enter) *
                                          (1 - .14 * brand),
                                      child: MorphingMark(
                                        reveal: timeline.reveal(t),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(height: Siga.s3),
                                  Opacity(
                                    opacity: brand,
                                    child: Transform.translate(
                                      offset: Offset(0, 8 * (1 - brand)),
                                      child: Column(
                                        children: [
                                          const Brand(size: 34),
                                          const SizedBox(height: Siga.s1),
                                          Text(
                                            'Educação que transforma em qualquer lugar',
                                            style: TextStyle(color: ink2),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ),
            ),
            Positioned(
              left: 0,
              right: 0,
              bottom: Siga.s3,
              child: Center(
                child: TextButton(
                  onPressed: finish,
                  style: TextButton.styleFrom(
                    foregroundColor: ink2,
                    minimumSize: const Size(88, 44),
                  ),
                  child: const Text('Saltar'),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// O mosaico do «S» a meio da transformação. [reveal] = 0 é o ícone; 1 é a
/// cápsula com «Seja bem-vindo». Valores intermédios são a própria transição.
class MorphingMark extends StatelessWidget {
  const MorphingMark({super.key, required this.reveal});
  final double reveal;
  @override
  Widget build(BuildContext context) {
    final r = reveal.clamp(0.0, 1.0);
    final maxFont = MediaQuery.sizeOf(context).width < 360 ? 28.0 : 34.0;
    final font = lerpDouble(64, maxFont, r)!;
    return Container(
      height: lerpDouble(104, 72, r),
      padding: EdgeInsets.symmetric(horizontal: lerpDouble(27, 26, r)!),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: Siga.brand.colors,
          stops: Siga.brand.stops,
          // O brilho do gradiente desliza enquanto a mensagem abre.
          transform: GradientRotation(.6 * r),
        ),
        borderRadius: BorderRadius.circular(lerpDouble(32, 36, r)!),
        boxShadow: const [
          BoxShadow(
            color: Color(0x47a259ff),
            blurRadius: 50,
            offset: Offset(0, 18),
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('S', style: _style(font)),
          ClipRect(
            child: Align(
              alignment: Alignment.centerLeft,
              widthFactor: r,
              child: Opacity(
                opacity: Curves.easeIn.transform(r),
                child: Text('eja bem-vindo', style: _style(font)),
              ),
            ),
          ),
        ],
      ),
    );
  }

  static TextStyle _style(double size) => TextStyle(
    color: Colors.white,
    fontSize: size,
    fontWeight: FontWeight.w800,
    letterSpacing: -size * .02,
    height: 1,
  );
}
