import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';

class AttendanceScreen extends ConsumerStatefulWidget {
  const AttendanceScreen({super.key});

  @override
  ConsumerState<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceScreenState extends ConsumerState<AttendanceScreen> {
  final Map<String, bool> _attendance = {};

  @override
  Widget build(BuildContext context) {
    final studentsAsync = ref.watch(studentsProvider((classId: null, page: 1)));

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Daily Attendance', style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: AppColors.secondary,
      ),
      body: studentsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Failed to load students', style: TextStyle(color: AppColors.error))),
        data: (paginated) {
          final students = paginated.data;
          for (final s in students) {
            _attendance.putIfAbsent(s.id, () => true);
          }
          final presentCount = _attendance.values.where((v) => v).length;

          return Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(24),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        const Icon(LucideIcons.calendar, size: 20, color: AppColors.textSecondary),
                        const SizedBox(width: 12),
                        Text('Today • ${DateTime.now().day}/${DateTime.now().month}/${DateTime.now().year}',
                            style: const TextStyle(fontWeight: FontWeight.bold)),
                      ],
                    ),
                    Text('$presentCount/${students.length}',
                        style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.primary)),
                  ],
                ),
              ),
              Expanded(
                child: students.isEmpty
                    ? const Center(child: Text('No students found.', style: TextStyle(color: AppColors.textSecondary)))
                    : ListView.builder(
                        padding: const EdgeInsets.symmetric(horizontal: 24),
                        itemCount: students.length,
                        itemBuilder: (context, index) {
                          final s = students[index];
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: CheckboxListTile(
                              value: _attendance[s.id] ?? true,
                              onChanged: (val) => setState(() => _attendance[s.id] = val ?? true),
                              title: Text(s.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                              subtitle: Text(s.className ?? '', style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                              secondary: CircleAvatar(
                                backgroundColor: AppColors.primary.withValues(alpha: 0.1),
                                child: Text(s.name.isNotEmpty ? s.name[0] : '?',
                                    style: const TextStyle(color: AppColors.secondary, fontWeight: FontWeight.bold)),
                              ),
                              activeColor: AppColors.primary,
                              checkColor: AppColors.secondary,
                              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                              tileColor: AppColors.surface,
                            ),
                          );
                        },
                      ),
              ),
              Padding(
                padding: const EdgeInsets.all(24),
                child: SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Attendance saved'), backgroundColor: Colors.green),
                      );
                      Navigator.pop(context);
                    },
                    child: const Text('Save Attendance'),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
