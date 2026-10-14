import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/utils/responsive_utils.dart';

class TeacherListScreen extends StatelessWidget {
  const TeacherListScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Staff Directory', style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: AppColors.secondary,
        actions: [
          IconButton(
            icon: const Icon(LucideIcons.userPlus),
            onPressed: () => context.push('/register-teacher'),
          ),
        ],
      ),
      body: ResponsiveConstrainedContent(
        child: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(LucideIcons.users, size: 56, color: AppColors.textSecondary.withValues(alpha: 0.3)),
              const SizedBox(height: 16),
              const Text('Register teachers using the + button above.',
                  style: TextStyle(color: AppColors.textSecondary, fontSize: 14)),
              const SizedBox(height: 24),
              ElevatedButton.icon(
                onPressed: () => context.push('/register-teacher'),
                icon: const Icon(LucideIcons.userPlus, size: 18),
                label: const Text('Register Teacher'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
