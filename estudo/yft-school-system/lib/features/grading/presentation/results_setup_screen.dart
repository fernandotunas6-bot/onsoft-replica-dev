import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';
import 'package:yft_school_system/core/settings/academic_year_state.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:go_router/go_router.dart';

class ResultsSetupScreen extends ConsumerStatefulWidget {
  const ResultsSetupScreen({super.key});

  @override
  ConsumerState<ResultsSetupScreen> createState() => _ResultsSetupScreenState();
}

class _ResultsSetupScreenState extends ConsumerState<ResultsSetupScreen> {
  String? _selectedClassId;
  String? _selectedTerm;
  String? _selectedStudentId;

  final List<String> _terms = ['Term 1', 'Term 2', 'Term 3'];

  @override
  Widget build(BuildContext context) {
    final academicYear = ref.watch(academicYearProvider);
    final classesAsync = ref.watch(classesProvider);
    final studentsAsync = _selectedClassId != null
        ? ref.watch(studentsProvider((classId: _selectedClassId, page: 1)))
        : null;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Results Setup', style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: AppColors.secondary,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(color: AppColors.secondary, borderRadius: BorderRadius.circular(20)),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                        color: AppColors.primary.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(12)),
                    child: const Icon(LucideIcons.calendarDays, color: AppColors.primary, size: 20),
                  ),
                  const SizedBox(width: 16),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Academic Year', style: TextStyle(color: Colors.white54, fontSize: 12)),
                      const SizedBox(height: 4),
                      Text('${academicYear.academicYear} • ${academicYear.activeTerm}',
                          style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.bold, fontSize: 16)),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            const Text('Select parameters to input or view student results.',
                style: TextStyle(color: AppColors.textSecondary, fontSize: 14)),
            const SizedBox(height: 32),

            const Text('Select Class',
                style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: AppColors.secondary)),
            const SizedBox(height: 8),
            classesAsync.when(
              loading: () => const LinearProgressIndicator(),
              error: (e, _) => const Text('Failed to load classes'),
              data: (classes) => _buildDropdown(
                icon: LucideIcons.graduationCap,
                value: _selectedClassId,
                items: classes.map((c) => DropdownMenuItem(value: c.id, child: Text(c.className))).toList(),
                onChanged: (val) => setState(() {
                  _selectedClassId = val;
                  _selectedStudentId = null;
                }),
              ),
            ),

            const SizedBox(height: 24),
            const Text('Select Term',
                style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: AppColors.secondary)),
            const SizedBox(height: 8),
            _buildDropdown(
              icon: LucideIcons.calendarDays,
              value: _selectedTerm,
              items: _terms.map((t) => DropdownMenuItem(value: t, child: Text(t))).toList(),
              onChanged: (val) => setState(() => _selectedTerm = val),
            ),

            const SizedBox(height: 24),
            const Text('Select Student',
                style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: AppColors.secondary)),
            const SizedBox(height: 8),
            if (studentsAsync == null)
              _buildDropdown<String>(
                icon: LucideIcons.user,
                value: null,
                items: [],
                onChanged: null,
              )
            else
              studentsAsync.when(
                loading: () => const LinearProgressIndicator(),
                error: (e, _) => const Text('Failed to load'),
                data: (paginated) => _buildDropdown(
                  icon: LucideIcons.user,
                  value: _selectedStudentId,
                  items: paginated.data
                      .map((s) => DropdownMenuItem(value: s.id, child: Text(s.name)))
                      .toList(),
                  onChanged: (val) => setState(() => _selectedStudentId = val),
                ),
              ),

            const SizedBox(height: 48),
            SizedBox(
              width: double.infinity,
              height: 56,
              child: ElevatedButton(
                onPressed: _selectedClassId != null && _selectedTerm != null && _selectedStudentId != null
                    ? () {
                        context.push('/results-input', extra: {
                          'studentId': _selectedStudentId,
                          'className': _selectedClassId,
                          'term': _selectedTerm,
                        });
                      }
                    : null,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  disabledBackgroundColor: AppColors.primary.withValues(alpha: 0.3),
                  foregroundColor: AppColors.secondary,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                ),
                child: const Text('Proceed', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDropdown<T>({
    required IconData icon,
    required T? value,
    required List<DropdownMenuItem<T>> items,
    required void Function(T?)? onChanged,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.background, width: 2),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<T>(
          value: value,
          isExpanded: true,
          icon: const Icon(LucideIcons.chevronDown, color: AppColors.textSecondary),
          hint: Text('Choose...', style: TextStyle(color: AppColors.textSecondary.withValues(alpha: 0.5))),
          items: items,
          onChanged: onChanged,
        ),
      ),
    );
  }
}
