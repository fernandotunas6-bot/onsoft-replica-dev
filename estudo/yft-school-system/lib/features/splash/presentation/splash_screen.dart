import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:go_router/go_router.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    _navigateToNext();
  }

  void _navigateToNext() async {
    await Future.delayed(const Duration(seconds: 3));
    if (mounted) {
      context.go('/login');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.primary,
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
                  'Edu Manager',
                  style: Theme.of(context).textTheme.displayLarge?.copyWith(
                    fontSize: 48,
                    letterSpacing: -1.5,
                    color: AppColors.secondary,
                  ),
                )
                .animate()
                .fadeIn(duration: 800.ms)
                .scale(
                  delay: 200.ms,
                  begin: const Offset(0.8, 0.8),
                  end: const Offset(1, 1),
                ),

            const SizedBox(height: 16),

            Text(
              'Modern School Ecosystem',
              style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                color: AppColors.secondary.withValues(alpha: 0.6),
                fontWeight: FontWeight.bold,
              ),
            ).animate().fadeIn(delay: 1000.ms, duration: 600.ms),
          ],
        ),
      ),
    );
  }
}
