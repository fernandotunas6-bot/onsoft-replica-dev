import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/network/api_client.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/utils/media_url.dart';
import 'package:yft_school_system/core/utils/responsive_utils.dart';

class TeacherDetailsScreen extends ConsumerWidget {
  final String id;
  const TeacherDetailsScreen({super.key, required this.id});

  String _formatDob(String? iso) {
    if (iso == null || iso.isEmpty) return '—';
    final parts = iso.split('-');
    if (parts.length == 3) {
      return '${parts[2]}/${parts[1]}/${parts[0]}';
    }
    return iso;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(teacherProfileProvider(id));
    final baseUrl = ref.watch(dioProvider).options.baseUrl;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: async.when(
          data: (t) => Text(
            t.name,
            style: const TextStyle(fontWeight: FontWeight.bold),
          ),
          loading: () => const Text(
            'Staff profile',
            style: TextStyle(fontWeight: FontWeight.bold),
          ),
          error: (Object e, StackTrace? st) => const Text(
            'Staff profile',
            style: TextStyle(fontWeight: FontWeight.bold),
          ),
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
                Text('Could not load teacher',
                    style: TextStyle(color: AppColors.error)),
                const SizedBox(height: 8),
                Text(
                  '$e',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: AppColors.textSecondary,
                    fontSize: 12,
                  ),
                ),
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: () => ref.invalidate(teacherProfileProvider(id)),
                  child: const Text('Retry'),
                ),
              ],
            ),
          ),
        ),
        data: (t) => _TeacherProfileBody(
          teacherId: id,
          name: t.name,
          staffId: t.staffId,
          phone: t.phone,
          email: t.email,
          photoUrl: profilePhotoUrlFromKey(t.photoUrl, baseUrl),
          residentialAddress: t.residentialAddress,
          qualification: t.qualification,
          yearsExperience: t.yearsExperience,
          subjectsText: t.subjectsText,
          ssnitNumber: t.ssnitNumber,
          maritalStatus: t.maritalStatus,
          emergencyContactName: t.emergencyContactName,
          emergencyContactPhone: t.emergencyContactPhone,
          bankName: t.bankName,
          bankAccountNumber: t.bankAccountNumber,
          bankAccountHolder: t.bankAccountHolder,
          gender: t.gender,
          dateOfBirth: _formatDob(t.dateOfBirth),
        ),
      ),
    );
  }
}

class _TeacherProfileBody extends StatelessWidget {
  final String teacherId;
  final String name;
  final String? staffId;
  final String? phone;
  final String? email;
  final String? photoUrl;
  final String? residentialAddress;
  final String? qualification;
  final int? yearsExperience;
  final String? subjectsText;
  final String? ssnitNumber;
  final String? maritalStatus;
  final String? emergencyContactName;
  final String? emergencyContactPhone;
  final String? bankName;
  final String? bankAccountNumber;
  final String? bankAccountHolder;
  final String? gender;
  final String dateOfBirth;

  const _TeacherProfileBody({
    required this.teacherId,
    required this.name,
    required this.staffId,
    required this.phone,
    required this.email,
    required this.photoUrl,
    required this.residentialAddress,
    required this.qualification,
    required this.yearsExperience,
    required this.subjectsText,
    required this.ssnitNumber,
    required this.maritalStatus,
    required this.emergencyContactName,
    required this.emergencyContactPhone,
    required this.bankName,
    required this.bankAccountNumber,
    required this.bankAccountHolder,
    required this.gender,
    required this.dateOfBirth,
  });

  @override
  Widget build(BuildContext context) {
    final initials = name.length >= 2
        ? name.substring(0, 2).toUpperCase()
        : name.isEmpty
            ? '?'
            : name[0].toUpperCase();

    return SingleChildScrollView(
      padding: getResponsiveHorizontalPadding(context)
          .copyWith(top: 8, bottom: 32),
      child: ResponsiveConstrainedContent(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: CircleAvatar(
                radius: 52,
                backgroundColor: AppColors.primary.withValues(alpha: 0.15),
                backgroundImage:
                    photoUrl != null ? NetworkImage(photoUrl!) : null,
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
                staffId ?? teacherId,
                style: const TextStyle(
                  color: AppColors.textSecondary,
                  fontSize: 13,
                ),
              ),
            ),
            const SizedBox(height: 24),
            _section(context, 'Profile', [
              _row(LucideIcons.users, 'Gender', gender ?? '—'),
              _row(LucideIcons.calendar, 'Date of birth', dateOfBirth),
              _row(LucideIcons.phone, 'Phone', phone ?? '—'),
              _row(LucideIcons.mail, 'Email', email ?? '—'),
              _row(LucideIcons.mapPin, 'Address', residentialAddress ?? '—'),
            ]),
            const SizedBox(height: 16),
            _section(context, 'Professional', [
              _row(LucideIcons.award, 'Qualification', qualification ?? '—'),
              _row(
                LucideIcons.briefcase,
                'Years experience',
                yearsExperience != null ? '$yearsExperience' : '—',
              ),
              _row(
                LucideIcons.bookOpen,
                'Subjects',
                subjectsText ?? '—',
                multiline: true,
              ),
            ]),
            const SizedBox(height: 16),
            _section(context, 'Other', [
              _row(LucideIcons.creditCard, 'SSNIT', ssnitNumber ?? '—'),
              _row(LucideIcons.heart, 'Marital status', maritalStatus ?? '—'),
            ]),
            const SizedBox(height: 16),
            _section(context, 'Emergency', [
              _row(LucideIcons.alertCircle, 'Name',
                  emergencyContactName ?? '—'),
              _row(LucideIcons.phone, 'Phone',
                  emergencyContactPhone ?? '—'),
            ]),
            const SizedBox(height: 16),
            _section(context, 'Bank', [
              _row(LucideIcons.building2, 'Bank', bankName ?? '—'),
              _row(LucideIcons.hash, 'Account', bankAccountNumber ?? '—'),
              _row(LucideIcons.user, 'Holder', bankAccountHolder ?? '—'),
            ]),
          ],
        ),
      ),
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

  Widget _row(
    IconData icon,
    String label,
    String value, {
    bool multiline = false,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      child: Row(
        crossAxisAlignment:
            multiline ? CrossAxisAlignment.start : CrossAxisAlignment.start,
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
              style: const TextStyle(
                fontWeight: FontWeight.w600,
                fontSize: 14,
                color: AppColors.textPrimary,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
