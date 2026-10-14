import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/features/academics/application/academic_state.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';

class MyClassesScreen extends ConsumerWidget {
  const MyClassesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final classesAsync = ref.watch(assignedClassesProvider);
    final selectedClass = ref.watch(selectedClassProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('My Assigned Classes', style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: AppColors.secondary,
      ),
      body: classesAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Failed to load classes', style: TextStyle(color: AppColors.error))),
        data: (classes) {
          if (classes.isEmpty) {
            return const Center(child: Text('No classes assigned.', style: TextStyle(color: AppColors.textSecondary)));
          }
          return ListView.builder(
            padding: const EdgeInsets.all(24),
            itemCount: classes.length,
            itemBuilder: (context, index) {
              final cls = classes[index];
              final isSelected = selectedClass?.id == cls.id;

              return Container(
                margin: const EdgeInsets.only(bottom: 16),
                decoration: BoxDecoration(
                  color: isSelected ? AppColors.primary : AppColors.surface,
                  borderRadius: BorderRadius.circular(24),
                  border: isSelected ? null : Border.all(color: AppColors.primary.withValues(alpha: 0.1)),
                ),
                child: ListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
                  onTap: () {
                    ref.read(selectedClassProvider.notifier).selectClass(cls);
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text('Dashboard switched to ${cls.className}'),
                        backgroundColor: AppColors.secondary,
                        duration: const Duration(seconds: 1),
                      ),
                    );
                  },
                  leading: Icon(LucideIcons.bookOpen, color: isSelected ? AppColors.secondary : AppColors.primary),
                  title: Text(cls.className,
                      style: TextStyle(fontWeight: FontWeight.bold, color: AppColors.secondary)),
                  subtitle: cls.level != null
                      ? Text('Level ${cls.level}',
                          style: TextStyle(
                            color: isSelected ? AppColors.secondary.withValues(alpha: 0.7) : AppColors.textSecondary,
                          ))
                      : null,
                  trailing: isSelected
                      ? const Icon(LucideIcons.checkCircle2, color: AppColors.secondary)
                      : const Icon(LucideIcons.chevronRight, size: 18),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
