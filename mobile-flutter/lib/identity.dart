import 'package:flutter/material.dart';

class Brand extends StatelessWidget {
  const Brand({super.key});
  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Semantics(
      label: 'SIGA Plus',
      child: ExcludeSemantics(
        child: Row(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.baseline,
          textBaseline: TextBaseline.alphabetic,
          children: [
            Text(
              'SIGA ',
              style: TextStyle(
                fontFamily: 'Inter',
                fontSize: 32,
                letterSpacing: -1.2,
                fontWeight: FontWeight.w600,
                color: Theme.of(context).colorScheme.onSurface,
              ),
            ),
            ShaderMask(
              blendMode: BlendMode.srcIn,
              shaderCallback: (bounds) => LinearGradient(
                colors: dark
                    ? [
                        const Color(0xffa898ff),
                        const Color(0xffed8ee4),
                        const Color(0xffffad80),
                      ]
                    : [
                        const Color(0xff6246ea),
                        const Color(0xffc026d3),
                        const Color(0xffe95a35),
                      ],
              ).createShader(bounds),
              child: const Text(
                'Plus',
                style: TextStyle(
                  fontFamily: 'Inter',
                  fontSize: 32,
                  letterSpacing: -1.2,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Apenas a marca com uma entrada breve. Sem vídeo, som ou morph inventado.
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
    duration: Duration(milliseconds: widget.short ? 500 : 1400),
  );
  late final CurvedAnimation enter = CurvedAnimation(
    parent: motion,
    curve: const Interval(0, .55, curve: Curves.easeOutCubic),
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
    motion.addStatusListener((status) {
      if (status == AnimationStatus.completed) finish();
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
    enter.dispose();
    motion.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Stack(
        children: [
          Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: FittedBox(
                fit: BoxFit.scaleDown,
                child: FadeTransition(
                  opacity: enter,
                  child: ScaleTransition(
                    scale: Tween<double>(begin: .96, end: 1).animate(enter),
                    child: const Brand(),
                  ),
                ),
              ),
            ),
          ),
          Positioned(
            right: 24,
            bottom: 16,
            child: TextButton(onPressed: finish, child: const Text('Saltar')),
          ),
        ],
      ),
    ),
  );
}
