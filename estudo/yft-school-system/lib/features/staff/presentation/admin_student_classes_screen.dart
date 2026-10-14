import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:go_router/go_router.dart';

class AdminStudentClassesScreen extends ConsumerWidget {
  const AdminStudentClassesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final classesAsync = ref.watch(classesProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('All Classes', style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: AppColors.secondary,
      ),
      body: classesAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('Failed to load classes', style: TextStyle(color: AppColors.error)),
              const SizedBox(height: 8),
              TextButton(onPressed: () => ref.invalidate(classesProvider), child: const Text('Retry')),
            ],
          ),
        ),
        data: (classes) => classes.isEmpty
            ? const Center(child: Text('No classes yet', style: TextStyle(color: AppColors.textSecondary)))
            : ListView.builder(
                padding: const EdgeInsets.all(24),
                itemCount: classes.length,
                itemBuilder: (context, index) {
                  final cls = classes[index];
                  return GestureDetector(
                    onTap: () => context.push('/student-directory?classId=${cls.id}'),
                    child: Container(
                      margin: const EdgeInsets.only(bottom: 16),
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: AppColors.surface,
                        borderRadius: BorderRadius.circular(20),
                        boxShadow: [
                          BoxShadow(color: Colors.black.withValues(alpha: 0.02), blurRadius: 10, offset: const Offset(0, 4)),
                        ],
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 56,
                            height: 56,
                            decoration: BoxDecoration(
                              color: AppColors.primary.withValues(alpha: 0.2),
                              borderRadius: BorderRadius.circular(16),
                            ),
                            child: const Icon(LucideIcons.graduationCap, color: AppColors.secondary, size: 28),
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(cls.className, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
                                if (cls.level != null)
                                  Text('Level ${cls.level}',
                                      style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                              ],
                            ),
                          ),
                          const Icon(LucideIcons.chevronRight, color: AppColors.primary),
                        ],
                      ),
                    ),
                  );
                },
              ),
      ),
    );
  }
}
