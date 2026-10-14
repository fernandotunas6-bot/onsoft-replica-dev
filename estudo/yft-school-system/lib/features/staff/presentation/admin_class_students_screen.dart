import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';

class AdminClassStudentsScreen extends ConsumerWidget {
  const AdminClassStudentsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final studentsAsync = ref.watch(studentsProvider((classId: null, page: 1)));

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Students Directory', style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: AppColors.secondary,
      ),
      body: studentsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('Failed to load students', style: TextStyle(color: AppColors.error)),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => ref.invalidate(studentsProvider((classId: null, page: 1))),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
        data: (paginated) {
          final students = paginated.data;
          if (students.isEmpty) {
            return const Center(child: Text('No students enrolled yet.', style: TextStyle(color: AppColors.textSecondary)));
          }
          return ListView.builder(
            padding: const EdgeInsets.all(24),
            itemCount: students.length,
            itemBuilder: (context, index) {
              final s = students[index];
              return Container(
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Row(
                  children: [
                    CircleAvatar(
                      backgroundColor: AppColors.primary.withValues(alpha: 0.1),
                      child: Text(s.name.isNotEmpty ? s.name[0] : '?',
                          style: const TextStyle(color: AppColors.secondary, fontWeight: FontWeight.bold)),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(s.name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                          Text(s.className ?? s.classId,
                              style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                        ],
                      ),
                    ),
                    const Icon(LucideIcons.chevronRight, color: AppColors.textSecondary, size: 20),
                  ],
                ),
              );
            },
          );
        },
      ),
    );
  }
}
