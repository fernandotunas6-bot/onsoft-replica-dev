import 'dart:math' as math;
import 'package:flutter/material.dart';

class Brand extends StatelessWidget {
  const Brand({super.key});
  @override
  Widget build(BuildContext context) => const Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Text(
        'SIGA ',
        style: TextStyle(fontSize: 28, fontWeight: FontWeight.w600),
      ),
      Text(
        'Plus',
        style: TextStyle(
          fontSize: 28,
          color: Color(0xff9954ed),
          fontWeight: FontWeight.w600,
        ),
      ),
    ],
  );
}

/// Interim typographic reveal; not an exact morph of the original logo vector.
/// Replace this painter with the approved Rive artboard before brand sign-off.
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
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Stack(
        children: [
          Center(
            child: AnimatedBuilder(
              animation: motion,
              builder: (context, _) {
                final t = motion.value;
                final reveal = widget.short
                    ? 0.0
                    : t < .25
                    ? 0.0
                    : t < .45
                    ? (t - .25) / .20
                    : t < .65
                    ? 1.0
                    : t < .85
                    ? 1 - (t - .65) / .20
                    : 0.0;
                return Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Semantics(
                      label: reveal > .5 ? 'Seja bem-vindo' : 'SIGA Plus',
                      child: ExcludeSemantics(
                        child: CustomPaint(
                          size: const Size(320, 110),
                          painter: _IdentityPainter(reveal, t),
                        ),
                      ),
                    ),
                    const SizedBox(height: 24),
                    Opacity(
                      opacity: t > .85 ? ((t - .85) / .15).clamp(0.0, 1.0) : 0,
                      child: const Brand(),
                    ),
                    const SizedBox(height: 12),
                    const Text(
                      'Educação que transforma',
                      style: TextStyle(color: Color(0xff707783)),
                    ),
                  ],
                );
              },
            ),
          ),
          Positioned(
            right: 24,
            bottom: 24,
            child: TextButton(onPressed: finish, child: const Text('Saltar')),
          ),
        ],
      ),
    ),
  );
}

class _IdentityPainter extends CustomPainter {
  _IdentityPainter(this.reveal, this.progress);
  final double reveal;
  final double progress;
  @override
  void paint(Canvas canvas, Size size) {
    final r = Curves.easeInOutCubic.transform(reveal.clamp(0.0, 1.0));
    final scale = .94 + .06 * math.min(progress * 5, 1);
    canvas.translate(size.width / 2, size.height / 2);
    canvas.scale(scale);
    final rect = Rect.fromCenter(
      center: Offset.zero,
      width: 84 + 220 * r,
      height: 84 - 12 * r,
    );
    final gradient = LinearGradient(
      colors: [
        const Color(0xffff914d),
        const Color(0xffed25ba),
        const Color(0xff7047ff),
        const Color(0xff3689fa),
      ].map((c) => c.withValues(alpha: 1 - r)).toList(),
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(rect, Radius.circular(26 - 10 * r)),
      Paint()
        ..shader = gradient.createShader(rect)
        ..color = Colors.white.withValues(alpha: 1 - r),
    );
    void text(String label, double font, double opacity) {
      final painter = TextPainter(
        text: TextSpan(
          text: label,
          style: TextStyle(
            fontSize: font,
            fontWeight: FontWeight.w600,
            color: (label == 'S' ? Colors.white : const Color(0xff7047ff))
                .withValues(alpha: opacity),
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout(maxWidth: size.width);
      painter.paint(canvas, Offset(-painter.width / 2, -painter.height / 2));
    }

    text('S', 58 + 14 * r, 1 - r);
    canvas.save();
    canvas.clipRect(rect);
    text('Seja bem-vindo', 28, r);
    canvas.restore();
  }

  @override
  bool shouldRepaint(_IdentityPainter old) =>
      old.reveal != reveal || old.progress != progress;
}
