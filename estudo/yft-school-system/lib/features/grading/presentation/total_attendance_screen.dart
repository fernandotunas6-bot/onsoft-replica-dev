import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';

class TotalAttendanceScreen extends ConsumerWidget {
  const TotalAttendanceScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final classesAsync = ref.watch(classesProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Total de presenças', style: TextStyle(fontWeight: FontWeight.w600)),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: AppColors.secondary,
      ),
      body: classesAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Não foi possível carregar', style: TextStyle(color: AppColors.error))),
        data: (classes) {
          if (classes.isEmpty) {
            return const Center(child: Text('Não há turmas configuradas.', style: TextStyle(color: AppColors.textSecondary)));
          }
          return Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(LucideIcons.barChart3, size: 56, color: AppColors.textSecondary.withValues(alpha: 0.3)),
                const SizedBox(height: 16),
                const Text('Os relatórios de presenças aparecem aqui.',
                    style: TextStyle(color: AppColors.textSecondary, fontSize: 14)),
                const SizedBox(height: 8),
                Text('${classes.length} class(es) configured',
                    style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
              ],
            ),
          );
        },
      ),
    );
  }
}
