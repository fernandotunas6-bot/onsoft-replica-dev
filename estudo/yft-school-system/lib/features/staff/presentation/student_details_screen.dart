import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/auth/auth_state.dart';
import 'package:yft_school_system/core/models/student.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';
import 'package:yft_school_system/core/settings/academic_year_state.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/network/api_client.dart';
import 'package:yft_school_system/core/utils/media_url.dart';
import 'package:yft_school_system/core/utils/responsive_utils.dart';

class StudentDetailsScreen extends ConsumerWidget {
  final String id;
  const StudentDetailsScreen({super.key, required this.id});

  String _formatDob(String? iso) {
    if (iso == null || iso.isEmpty) return '—';
    final parts = iso.split('-');
    if (parts.length == 3) {
      return '${parts[2]}/${parts[1]}/${parts[0]}';
    }
    return iso;
  }

  Future<void> _confirmDelete(
    BuildContext context,
    WidgetRef ref,
    Student student,
  ) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete student?'),
        content: Text(
          'This removes ${student.name}, their grades, fee history, and enrollments. '
          'The parent account is deleted only if they have no other children at this school.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.error),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;

    try {
      await ref.read(studentRepositoryProvider).deleteStudent(student.id);
      ref.invalidate(studentsProvider((classId: null, page: 1)));
      ref.invalidate(studentsProvider((classId: student.classId, page: 1)));
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Student removed')),
        );
        context.pop();
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('$e'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    }
  }

  Future<void> _setActive(
    BuildContext context,
    WidgetRef ref,
    Student student,
    bool active,
  ) async {
    try {
      await ref.read(studentRepositoryProvider).updateStudent(
            student.id,
            isActive: active,
          );
      ref.invalidate(studentByIdProvider(student.id));
      ref.invalidate(studentsProvider((classId: null, page: 1)));
      ref.invalidate(studentsProvider((classId: student.classId, page: 1)));
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(active ? 'Student activated' : 'Student deactivated'),
          ),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('$e'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(studentByIdProvider(id));
    final currency = ref.watch(academicYearProvider).currency;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: async.when(
          data: (s) => Text(s.name,
              style: const TextStyle(fontWeight: FontWeight.bold)),
          loading: () => const Text('Student Profile',
              style: TextStyle(fontWeight: FontWeight.bold)),
          error: (e, s) => const Text('Student Profile',
              style: TextStyle(fontWeight: FontWeight.bold)),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: AppColors.secondary,
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(LucideIcons.alertTriangle,
                    size: 48, color: AppColors.error),
                const SizedBox(height: 16),
                Text('Could not load student',
                    style: TextStyle(color: AppColors.error)),
                const SizedBox(height: 8),
                Text('$e',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                        color: AppColors.textSecondary, fontSize: 12)),
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: () =>
                      ref.invalidate(studentByIdProvider(id)),
                  child: const Text('Retry'),
                ),
              ],
            ),
          ),
        ),
        data: (student) {
          final isAdmin = ref.watch(authProvider)?.role == UserRole.admin;
          final apiBaseUrl = ref.read(dioProvider).options.baseUrl;
          return Column(
            children: [
              Expanded(
                child: SingleChildScrollView(
                  padding: getResponsiveHorizontalPadding(context)
                      .copyWith(top: 8, bottom: 16),
                  child: ResponsiveConstrainedContent(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (!student.isActive)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: Material(
                              color: Colors.orange.shade50,
                              borderRadius: BorderRadius.circular(12),
                              child: Padding(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 14, vertical: 10),
                                child: Row(
                                  children: [
                                    Icon(Icons.pause_circle_outline,
                                        color: Colors.orange.shade800),
                                    const SizedBox(width: 10),
                                    Expanded(
                                      child: Text(
                                        'This student is inactive and hidden from the parent app.',
                                        style: TextStyle(
                                          color: Colors.orange.shade900,
                                          fontSize: 13,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        _StudentProfileBody(
                          student: student,
                          currency: currency,
                          formatDob: _formatDob,
                          apiBaseUrl: apiBaseUrl,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              if (isAdmin)
                SafeArea(
                  top: false,
                  child: Padding(
                    padding: getResponsiveHorizontalPadding(context)
                        .copyWith(bottom: 16, top: 8),
                    child: ResponsiveConstrainedContent(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Row(
                            children: [
                              IconButton.filledTonal(
                                onPressed: () => context
                                    .push('/admission?id=${student.id}'),
                                icon: const Icon(LucideIcons.pencil, size: 22),
                                tooltip: 'Edit',
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: OutlinedButton.icon(
                                  onPressed: () => _setActive(
                                    context,
                                    ref,
                                    student,
                                    !student.isActive,
                                  ),
                                  icon: Icon(
                                    student.isActive
                                        ? LucideIcons.userX
                                        : LucideIcons.userCheck,
                                    size: 20,
                                  ),
                                  label: Text(student.isActive
                                      ? 'Deactivate'
                                      : 'Activate'),
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: OutlinedButton.icon(
                                  style: OutlinedButton.styleFrom(
                                    foregroundColor: AppColors.error,
                                    side: const BorderSide(
                                        color: AppColors.error),
                                  ),
                                  onPressed: () =>
                                      _confirmDelete(context, ref, student),
                                  icon: const Icon(LucideIcons.trash2, size: 20),
                                  label: const Text('Delete'),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
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

class _StudentProfileBody extends StatelessWidget {
  final Student student;
  final String currency;
  final String Function(String?) formatDob;
  final String apiBaseUrl;

  const _StudentProfileBody({
    required this.student,
    required this.currency,
    required this.formatDob,
    required this.apiBaseUrl,
  });

  @override
  Widget build(BuildContext context) {
    final initials = student.name.length >= 2
        ? student.name.substring(0, 2).toUpperCase()
        : student.name.isEmpty
            ? '?'
            : student.name[0].toUpperCase();

    final photoUrl = profilePhotoUrlFromKey(student.photoUrl, apiBaseUrl);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Center(
          child: CircleAvatar(
            radius: 52,
            backgroundColor: AppColors.primary.withValues(alpha: 0.15),
            backgroundImage:
                photoUrl != null ? NetworkImage(photoUrl) : null,
            onBackgroundImageError: photoUrl != null
                ? (Object error, StackTrace? stackTrace) {}
                : null,
            child: photoUrl == null
                ? Text(
                    initials,
                    style: const TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.bold,
                      color: AppColors.secondary,
                    ),
                  )
                : null,
          ),
        ),
        const SizedBox(height: 8),
        Center(
          child: Text(
            student.id,
            style: const TextStyle(
              color: AppColors.textSecondary,
              fontSize: 13,
            ),
          ),
        ),
        const SizedBox(height: 24),
        _section(context, 'Student', [
          _row(LucideIcons.bookOpen, 'Class',
              student.className ?? student.classId),
          _row(LucideIcons.users, 'Gender', student.gender ?? '—'),
          _row(LucideIcons.calendar, 'Date of birth', formatDob(student.dob)),
          _row(LucideIcons.school, 'Previous school',
              student.previousSchool ?? '—'),
          _row(LucideIcons.mapPin, 'Address', student.address ?? '—'),
        ]),
        const SizedBox(height: 16),
        _section(context, 'Emergency', [
          _row(LucideIcons.alertCircle, 'Contact name',
              student.emergencyContactName ?? '—'),
          _row(LucideIcons.phone, 'Contact phone',
              student.emergencyContactPhone ?? '—'),
        ]),
        const SizedBox(height: 16),
        _section(context, 'Health', [
          _row(LucideIcons.droplet, 'Blood group',
              student.bloodGroup ?? '—'),
          _row(LucideIcons.heartHandshake, 'Medical notes',
              student.medicalNotes ?? '—'),
        ]),
        const SizedBox(height: 16),
        _section(context, 'Parent / guardian', [
          _row(LucideIcons.contact, 'Name', student.parentName ?? '—'),
          _row(LucideIcons.phone, 'Phone', student.parentPhone ?? '—'),
          _row(LucideIcons.mail, 'Email', student.parentEmail ?? '—'),
        ]),
        const SizedBox(height: 16),
        _section(context, 'Fees', [
          _row(
            LucideIcons.wallet,
            'Balance',
            student.hasDebt
                ? '$currency ${student.balance.abs().toStringAsFixed(2)} (owing)'
                : student.isOverpaid
                    ? '+$currency ${student.balance.toStringAsFixed(2)} (credit)'
                    : '$currency 0.00 (cleared)',
            valueColor: student.hasDebt
                ? Colors.red.shade700
                : student.isOverpaid
                    ? Colors.green.shade700
                    : AppColors.textPrimary,
          ),
        ]),
      ],
    );
  }

  Widget _section(BuildContext context, String title, List<Widget> rows) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
            child: Text(
              title,
              style: const TextStyle(
                fontWeight: FontWeight.bold,
                fontSize: 16,
                color: AppColors.secondary,
              ),
            ),
          ),
          const Divider(height: 1),
          ...rows,
        ],
      ),
    );
  }

  Widget _row(IconData icon, String label, String value,
      {Color? valueColor}) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: AppColors.textSecondary),
          const SizedBox(width: 14),
          Expanded(
            flex: 2,
            child: Text(
              label,
              style: const TextStyle(
                color: AppColors.textSecondary,
                fontSize: 14,
              ),
            ),
          ),
          Expanded(
            flex: 3,
            child: Text(
              value,
              textAlign: TextAlign.end,
              style: TextStyle(
                fontWeight: FontWeight.w600,
                fontSize: 14,
                color: valueColor ?? AppColors.textPrimary,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
