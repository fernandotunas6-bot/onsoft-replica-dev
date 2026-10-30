import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/utils/responsive_utils.dart';
import 'package:yft_school_system/features/splash/presentation/splash_screen.dart';

/// Um diapositivo: mosaicos flutuantes à volta de um principal, e o texto.
class _Slide {
  final String title;
  final String body;
  final IconData hero;
  final List<(IconData, Color)> around;

  const _Slide(this.title, this.body, this.hero, this.around);
}

/// Apresentação (ecrã 4 do mockup). Só aparece na primeira abertura.
class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _pages = PageController();
  int _index = 0;

  static final _slides = [
    _Slide(
      'Tudo o que a sua escola precisa',
      'Ensino, aprendizagem, comunicação e gestão num só lugar.',
      LucideIcons.barChart3,
      [
        (LucideIcons.graduationCap, AppColors.tileColors[0]),
        (LucideIcons.users, AppColors.tileColors[4]),
        (LucideIcons.calendarDays, AppColors.tileColors[5]),
        (LucideIcons.search, AppColors.tileColors[2]),
      ],
    ),
    _Slide(
      'A escola sempre por perto',
      'Comunicados, calendário e disciplinas à mão, no telemóvel ou no '
          'computador.',
      LucideIcons.messageCircle,
      [
        (LucideIcons.bell, AppColors.tileColors[3]),
        (LucideIcons.bookOpen, AppColors.tileColors[1]),
        (LucideIcons.calendarDays, AppColors.tileColors[5]),
        (LucideIcons.megaphone, AppColors.tileColors[0]),
      ],
    ),
    _Slide(
      'Propinas e recibos sem filas',
      'Acompanhe pagamentos, saldos e recibos da escola em segurança.',
      LucideIcons.wallet,
      [
        (LucideIcons.receipt, AppColors.tileColors[1]),
        (LucideIcons.shieldCheck, AppColors.tileColors[2]),
        (LucideIcons.creditCard, AppColors.tileColors[3]),
        (LucideIcons.fileText, AppColors.tileColors[4]),
      ],
    ),
  ];

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  Future<void> _finish() async {
    try {
      await const FlutterSecureStorage().write(
        key: onboardingSeenKey,
        value: 'true',
      );
    } catch (_) {
      // Sem armazenamento: volta a aparecer na próxima abertura, sem dano.
    }
    if (mounted) context.go('/login');
  }

  void _next() {
    if (_index == _slides.length - 1) {
      _finish();
    } else {
      _pages.nextPage(
        duration: const Duration(milliseconds: 320),
        curve: Curves.easeOutCubic,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final last = _index == _slides.length - 1;

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: ResponsiveConstrainedContent(
          child: Column(
            children: [
              Align(
                alignment: Alignment.centerRight,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(0, 8, 12, 0),
                  child: AnimatedOpacity(
                    opacity: last ? 0 : 1,
                    duration: const Duration(milliseconds: 200),
                    child: TextButton(
                      onPressed: last ? null : _finish,
                      child: Text(
                        'Saltar',
                        style: TextStyle(color: AppColors.textSecondary),
                      ),
                    ),
                  ),
                ),
              ),
              Expanded(
                child: PageView.builder(
                  controller: _pages,
                  itemCount: _slides.length,
                  onPageChanged: (i) => setState(() => _index = i),
                  itemBuilder: (context, i) {
                    final s = _slides[i];
                    return Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 32),
                      child: Column(
                        children: [
                          const Spacer(),
                          _Illustration(slide: s),
                          const SizedBox(height: 40),
                          Text(
                            s.title,
                            textAlign: TextAlign.center,
                            style: textTheme.displayMedium?.copyWith(
                              fontSize: 26,
                              height: 1.2,
                            ),
                          ),
                          const SizedBox(height: 12),
                          Text(
                            s.body,
                            textAlign: TextAlign.center,
                            style: textTheme.bodyMedium?.copyWith(
                              fontSize: 15,
                              height: 1.45,
                            ),
                          ),
                          const Spacer(),
                        ],
                      ),
                    );
                  },
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(32, 0, 24, 28),
                child: Row(
                  children: [
                    for (var i = 0; i < _slides.length; i++)
                      AnimatedContainer(
                        duration: const Duration(milliseconds: 220),
                        margin: const EdgeInsets.only(right: 8),
                        width: i == _index ? 22 : 8,
                        height: 8,
                        decoration: BoxDecoration(
                          color: i == _index
                              ? AppColors.primary
                              : AppColors.textSecondary.withValues(alpha: 0.25),
                          borderRadius: BorderRadius.circular(4),
                        ),
                      ),
                    const Spacer(),
                    Semantics(
                      button: true,
                      label: last ? 'Começar' : 'Seguinte',
                      child: Material(
                        color: AppColors.ink,
                        shape: const CircleBorder(),
                        child: InkWell(
                          customBorder: const CircleBorder(),
                          onTap: _next,
                          child: const SizedBox(
                            width: 56,
                            height: 56,
                            child: Icon(
                              LucideIcons.arrowRight,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Illustration extends StatelessWidget {
  final _Slide slide;

  const _Illustration({required this.slide});

  @override
  Widget build(BuildContext context) {
    // Posições relativas num quadrado de 260: canto sup.-esq., sup.-dir.,
    // inf.-esq., inf.-dir.
    const spots = [
      Offset(0.02, 0.06),
      Offset(0.70, 0.0),
      Offset(0.0, 0.62),
      Offset(0.66, 0.70),
    ];
    const box = 260.0;

    Widget tile(IconData icon, Color color, double size) => Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(size * 0.28),
        boxShadow: [
          BoxShadow(
            color: color.withValues(alpha: 0.18),
            blurRadius: 24,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Icon(icon, color: color, size: size * 0.45),
    );

    return SizedBox(
      width: box,
      height: box,
      child: Stack(
        children: [
          Center(
            child: Container(
              width: 200,
              height: 200,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    AppColors.primary.withValues(alpha: 0.14),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),
          for (var i = 0; i < slide.around.length && i < spots.length; i++)
            Positioned(
              left: spots[i].dx * box,
              top: spots[i].dy * box,
              child: tile(slide.around[i].$1, slide.around[i].$2, 72),
            ),
          Center(child: tile(slide.hero, AppColors.primary, 110)),
        ],
      ),
    );
  }
}
