import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/models/school_class.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/utils/responsive_utils.dart';
import 'package:yft_school_system/core/widgets/section_widgets.dart';
import 'package:yft_school_system/features/academics/application/academic_state.dart';

/// As turmas do professor: primeiro as que tem no horário, depois as outras
/// da escola. A escolhida passa a ser a turma por omissão nas presenças.
class MyClassesScreen extends ConsumerWidget {
  const MyClassesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final classesAsync = ref.watch(classesProvider);
    final mine =
        ref.watch(teacherClassIdsProvider).whenOrNull(data: (s) => s) ??
        const <String>{};
    final selected = ref.watch(selectedClassProvider);
    final pad = getResponsiveHorizontalPadding(context);

    Widget tile(SchoolClass cls) {
      final isSelected = selected?.id == cls.id;
      return Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: SoftCard(
          onTap: () {
            ref.read(selectedClassProvider.notifier).selectClass(cls);
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text('As presenças passam a abrir em ${cls.className}.'),
                duration: const Duration(seconds: 2),
              ),
            );
          },
          child: Row(
            children: [
              IconTile(
                icon: LucideIcons.layoutGrid,
                color: isSelected ? AppColors.primary : AppColors.textSecondary,
                size: 40,
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      cls.className,
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w500,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    if (cls.level != null)
                      Text(
                        'Nível ${cls.level}',
                        style: TextStyle(
                          fontSize: 12,
                          color: AppColors.textSecondary,
                        ),
                      ),
                  ],
                ),
              ),
              if (isSelected)
                Icon(LucideIcons.checkCircle2, color: AppColors.primary)
              else
                Icon(Icons.chevron_right_rounded,
                    color: AppColors.textSecondary),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text(
          'As minhas turmas',
          style: TextStyle(fontWeight: FontWeight.w600),
        ),
      ),
      body: ResponsiveConstrainedContent(
        child: classesAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (_, _) => EmptyHint(
            icon: LucideIcons.wifiOff,
            message: 'Não foi possível carregar as turmas.',
            action: TextButton(
              onPressed: () => ref.invalidate(classesProvider),
              child: const Text('Tentar de novo'),
            ),
          ),
          data: (classes) {
            if (classes.isEmpty) {
              return const EmptyHint(
                icon: LucideIcons.layoutGrid,
                message: 'A escola ainda não tem turmas.',
              );
            }
            final teaching = classes.where((c) => mine.contains(c.id)).toList();
            final others = classes.where((c) => !mine.contains(c.id)).toList();
            return ListView(
              padding: EdgeInsets.fromLTRB(pad.left, 8, pad.right, 32),
              children: [
                if (teaching.isNotEmpty) ...[
                  const SectionHeader(title: 'No meu horário'),
                  for (final c in teaching) tile(c),
                  const SizedBox(height: 12),
                  const SectionHeader(title: 'Outras turmas da escola'),
                ] else
                  Padding(
                    padding: const EdgeInsets.only(bottom: 16),
                    child: Text(
                      'Quando o horário tiver aulas suas, essas turmas aparecem '
                      'aqui em primeiro lugar.',
                      style: TextStyle(
                        fontSize: 13,
                        height: 1.4,
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ),
                for (final c in others) tile(c),
              ],
            );
          },
        ),
      ),
    );
  }
}
