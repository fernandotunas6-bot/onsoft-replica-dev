import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:go_router/go_router.dart';
import 'package:yft_school_system/core/models/school_class.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';
import 'package:yft_school_system/core/settings/academic_year_state.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/utils/responsive_utils.dart';
import 'package:yft_school_system/core/utils/currency_display.dart';

class ClassListScreen extends ConsumerWidget {
  const ClassListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final classesAsync = ref.watch(classesProvider);
    final currency = ref.watch(academicYearProvider).currency;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text(
          'Turmas',
          style: TextStyle(fontWeight: FontWeight.w600),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: AppColors.secondary,
        actions: [
          IconButton(
            tooltip: 'Disciplinas',
            icon: const Icon(LucideIcons.book),
            onPressed: () => context.push('/subjects'),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        tooltip: 'Nova turma',
        onPressed: () => context.push('/class-setup'),
        backgroundColor: AppColors.primary,
        child: Icon(LucideIcons.plus, color: AppColors.onPrimary),
      ),
      body: classesAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(LucideIcons.alertTriangle, size: 48, color: AppColors.error),
              const SizedBox(height: 16),
              Text(
                'Não foi possível carregar as turmas',
                style: TextStyle(color: AppColors.textSecondary, fontSize: 16),
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () => ref.invalidate(classesProvider),
                child: const Text('Tentar de novo'),
              ),
            ],
          ),
        ),
        data: (classes) => ResponsiveConstrainedContent(
          child: classes.isEmpty
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        LucideIcons.graduationCap,
                        size: 56,
                        color: AppColors.textSecondary.withValues(alpha: 0.3),
                      ),
                      const SizedBox(height: 16),
                      Text(
                        'Ainda não há turmas. Toque em + para criar a primeira.',
                        style: TextStyle(
                          color: AppColors.textSecondary,
                          fontSize: 14,
                        ),
                      ),
                    ],
                  ),
                )
              : RefreshIndicator(
                  onRefresh: () async => ref.invalidate(classesProvider),
                  child: ListView.builder(
                    padding: getResponsiveHorizontalPadding(
                      context,
                    ).copyWith(top: 16, bottom: 100),
                    itemCount: classes.length,
                    itemBuilder: (context, index) {
                      final cls = classes[index];
                      return GestureDetector(
                        onTap: () => context.push('/class-setup', extra: cls),
                        onLongPress: () =>
                            _showDeleteConfirm(context, ref, cls),
                        child: Container(
                          margin: const EdgeInsets.only(bottom: 16),
                          padding: const EdgeInsets.all(20),
                          decoration: BoxDecoration(
                            color: AppColors.surface,
                            borderRadius: BorderRadius.circular(24),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withValues(alpha: 0.02),
                                blurRadius: 10,
                                offset: const Offset(0, 4),
                              ),
                            ],
                          ),
                          child: Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(
                                  color: AppColors.primary.withValues(
                                    alpha: 0.1,
                                  ),
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: Icon(
                                  LucideIcons.graduationCap,
                                  color: AppColors.secondary,
                                ),
                              ),
                              const SizedBox(width: 16),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      cls.className,
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w600,
                                        fontSize: 18,
                                      ),
                                    ),
                                    if (cls.level != null)
                                      Text(
                                        'Nível ${cls.level}',
                                        style: TextStyle(
                                          color: AppColors.textSecondary,
                                          fontSize: 14,
                                        ),
                                      ),
                                    if (cls.hasFeeStructure)
                                      Text(
                                        'Propina: ${formatMoneyDisplay(currency, cls.feeAmount)} / ${cls.feeCollectionCycle == 'year' ? 'ano' : 'período'}',
                                        style: TextStyle(
                                          color: AppColors.textSecondary,
                                          fontSize: 13,
                                        ),
                                      ),
                                  ],
                                ),
                              ),
                              IconButton(
                                tooltip: 'Apagar turma',
                                icon: Icon(
                                  LucideIcons.trash2,
                                  color: AppColors.error,
                                  size: 20,
                                ),
                                onPressed: () =>
                                    _showDeleteConfirm(context, ref, cls),
                              ),
                              Icon(
                                LucideIcons.chevronRight,
                                color: AppColors.textSecondary,
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),
        ),
      ),
    );
  }

  void _showDeleteConfirm(
    BuildContext context,
    WidgetRef ref,
    SchoolClass cls,
  ) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        bool isDeleting = false;
        return StatefulBuilder(
          builder: (ctx, setSheetState) => Container(
            decoration: BoxDecoration(
              color: AppColors.background,
              borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
            ),
            padding: EdgeInsets.fromLTRB(
              32,
              32,
              32,
              MediaQuery.of(ctx).padding.bottom + 32,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  LucideIcons.alertTriangle,
                  size: 48,
                  color: AppColors.error,
                ),
                const SizedBox(height: 16),
                Text(
                  'Apagar "${cls.className}"?',
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Também remove as disciplinas atribuídas a esta turma.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppColors.textSecondary),
                ),
                const SizedBox(height: 24),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => Navigator.pop(ctx),
                        child: const Text('Cancelar'),
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.error,
                        ),
                        onPressed: isDeleting
                            ? null
                            : () async {
                                setSheetState(() => isDeleting = true);
                                try {
                                  await ref
                                      .read(classRepositoryProvider)
                                      .deleteClass(cls.id);
                                  ref.invalidate(classesProvider);
                                  if (ctx.mounted) Navigator.pop(ctx);
                                } catch (e) {
                                  setSheetState(() => isDeleting = false);
                                  if (ctx.mounted) {
                                    ScaffoldMessenger.of(ctx).showSnackBar(
                                      SnackBar(
                                        content: Text('$e'),
                                        backgroundColor: AppColors.error,
                                      ),
                                    );
                                  }
                                }
                              },
                        child: isDeleting
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Text(
                                'Apagar',
                                style: TextStyle(color: Colors.white),
                              ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
