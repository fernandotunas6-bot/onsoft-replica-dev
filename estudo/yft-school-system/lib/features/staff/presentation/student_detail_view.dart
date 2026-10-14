import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';

/// Legacy route without an id — send users to the directory.
class StudentDetailView extends StatelessWidget {
  const StudentDetailView({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Student profile',
            style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: AppColors.secondary,
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(LucideIcons.users,
                  size: 56,
                  color: AppColors.textSecondary.withValues(alpha: 0.35)),
              const SizedBox(height: 20),
              const Text(
                'Open a student from the directory to see their full profile.',
                textAlign: TextAlign.center,
                style: TextStyle(
                    color: AppColors.textSecondary, fontSize: 15, height: 1.4),
              ),
              const SizedBox(height: 28),
              FilledButton.icon(
                onPressed: () => context.go('/student-directory'),
                icon: const Icon(LucideIcons.list),
                label: const Text('Go to student directory'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
