import 'dart:ui' show ImageFilter;

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/widgets/brand_mark.dart';
import 'package:yft_school_system/core/sga/sga_config.dart';
import 'package:yft_school_system/core/sga/sga_providers.dart';

/// Chave do armazenamento que diz se a apresentação já foi vista.
const onboardingSeenKey = 'onboarding_seen';

/// Abertura em três tempos, como no mockup: o "S" aparece, dilata e revela
/// "Seja bem-vindo", e volta a encolher para o logótipo.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 3200),
  );

  @override
  void initState() {
    super.initState();
    _c.forward().whenComplete(_navigateToNext);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Reduzir movimentos: sem a dilatação, uma pausa curta e segue.
    if (MediaQuery.of(context).disableAnimations && _c.value < 0.5) {
      _c.duration = const Duration(milliseconds: 900);
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  Future<void> _navigateToNext() async {
    var seen = false;
    try {
      seen = await const FlutterSecureStorage().read(key: onboardingSeenKey) ==
          'true';
    } catch (_) {
      // Sem armazenamento (testes, navegador sem permissão): mostrar.
    }
    var signedIn = false;
    try {
      signedIn = sgaMode
          ? await appSgaSession.restore()
          : FirebaseAuth.instance.currentUser != null;
    } catch (_) {
      // Firebase por inicializar.
    }
    if (!mounted) return;
    context.go(
      !seen
          ? '/bem-vindo'
          : signedIn
          ? '/dashboard'
          : '/login',
    );
  }

  @override
  Widget build(BuildContext context) {
    final reduce = MediaQuery.of(context).disableAnimations;
    final textTheme = Theme.of(context).textTheme;

    return Scaffold(
      backgroundColor: AppColors.background,
      body: AnimatedBuilder(
        animation: _c,
        builder: (context, _) {
          final t = _c.value;
          // 0 → 0,25: entra; 0,25 → 0,45: dilata; 0,45 → 0,7: mensagem;
          // 0,7 → 0,9: encolhe de volta.
          final enter = Curves.easeOutBack.transform((t / 0.25).clamp(0, 1));
          final grow = reduce
              ? 0.0
              : Curves.easeInOut.transform(((t - 0.25) / 0.2).clamp(0, 1)) *
                    (1 -
                        Curves.easeInOut.transform(
                          ((t - 0.7) / 0.2).clamp(0, 1),
                        ));
          final welcome = !reduce && t > 0.38 && t < 0.78;

          return Stack(
            fit: StackFit.expand,
            children: [
              // Halo suave das cores da marca por trás de tudo.
              Center(
                child: Container(
                  width: 320 + 200 * grow,
                  height: 320 + 200 * grow,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: RadialGradient(
                      colors: [
                        AppColors.brandColors[2].withValues(
                          alpha: AppColors.isDark ? 0.18 : 0.10,
                        ),
                        Colors.transparent,
                      ],
                    ),
                  ),
                ),
              ),
              SafeArea(
                child: Column(
                  children: [
                    const Spacer(flex: 3),
                    SizedBox(
                      height: 200,
                      child: Center(
                        child: Opacity(
                          opacity: 1 - 0.75 * grow,
                          child: ImageFiltered(
                            imageFilter: ImageFilter.blur(
                              sigmaX: 18 * grow,
                              sigmaY: 18 * grow,
                            ),
                            child: Transform.scale(
                              scale: enter * (1 + 1.4 * grow),
                              child: const BrandMark(size: 110),
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 28),
                    SizedBox(
                      height: 110,
                      child: AnimatedSwitcher(
                        duration: const Duration(milliseconds: 350),
                        child: welcome
                            ? Column(
                                key: const ValueKey('welcome'),
                                children: [
                                  ShaderMask(
                                    blendMode: BlendMode.srcIn,
                                    shaderCallback: (r) =>
                                        AppColors.brandGradient.createShader(r),
                                    child: const Text(
                                      'Seja bem-vindo',
                                      style: TextStyle(
                                        fontSize: 30,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(height: 6),
                                  Text(
                                    'Ao SIGA Plus',
                                    style: textTheme.bodyLarge?.copyWith(
                                      fontSize: 18,
                                    ),
                                  ),
                                  const SizedBox(height: 6),
                                  Text(
                                    'Educação que transforma\nem qualquer lugar',
                                    textAlign: TextAlign.center,
                                    style: textTheme.bodyMedium,
                                  ),
                                ],
                              )
                            : Opacity(
                                key: const ValueKey('brand'),
                                opacity: enter.clamp(0, 1),
                                child: Column(
                                  children: [
                                    const BrandWordmark(fontSize: 32),
                                    const SizedBox(height: 10),
                                    Text(
                                      'Educação que transforma\nem qualquer lugar',
                                      textAlign: TextAlign.center,
                                      style: textTheme.bodyMedium?.copyWith(
                                        fontSize: 15,
                                        height: 1.4,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                      ),
                    ),
                    const Spacer(flex: 4),
                    // Barra de progresso fina, como no mockup.
                    Container(
                      width: 90,
                      height: 4,
                      decoration: BoxDecoration(
                        color: AppColors.textSecondary.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(2),
                      ),
                      alignment: Alignment.centerLeft,
                      child: FractionallySizedBox(
                        widthFactor: t.clamp(0.05, 1),
                        child: Container(
                          decoration: BoxDecoration(
                            color: AppColors.primary,
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 32),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
