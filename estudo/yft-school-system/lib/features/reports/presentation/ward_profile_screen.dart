import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/models/student.dart';
import 'package:yft_school_system/core/settings/academic_year_state.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/utils/responsive_utils.dart';
import 'package:yft_school_system/core/widgets/profile_photo_avatar.dart';

class WardProfileScreen extends ConsumerWidget {
  final Student? ward;

  const WardProfileScreen({super.key, this.ward});

  static Widget _actionCard({
    required IconData icon,
    required String title,
    required Color color,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(24),
      child: Container(
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
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircleAvatar(
              backgroundColor: color.withValues(alpha: 0.1),
              radius: 28,
              child: Icon(icon, color: color, size: 28),
            ),
            const SizedBox(height: 12),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currency = ref.watch(academicYearProvider).currency;

    if (ward != null) {
      final w = ward!;
      final isCleared = w.isCleared;
      final hasDebt = w.hasDebt;
      final balanceText = hasDebt
          ? 'Outstanding: $currency ${w.balance.abs().toStringAsFixed(2)}'
          : isCleared
              ? 'All fees cleared'
              : 'Credit balance: $currency ${w.balance.toStringAsFixed(2)}';
      final balanceColor = hasDebt
          ? AppColors.error
          : (isCleared ? Colors.green : Colors.blueAccent);

      final statusHint = hasDebt
          ? 'Please clear outstanding fees to avoid disruptions.'
          : isCleared
              ? 'Account is in good standing.'
              : 'This credit will apply toward future fee charges.';

      return Scaffold(
        backgroundColor: AppColors.background,
        appBar: AppBar(
          title: const Text(
            'Ward Profile',
            style: TextStyle(fontWeight: FontWeight.bold),
          ),
          backgroundColor: Colors.transparent,
          elevation: 0,
          foregroundColor: AppColors.secondary,
        ),
        body: SingleChildScrollView(
          padding: getResponsiveHorizontalPadding(
            context,
          ).copyWith(top: 24, bottom: 40),
          child: ResponsiveConstrainedContent(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                WardPhotoAvatar(ward: w, radius: 56),
                const SizedBox(height: 16),
                Text(
                  w.name,
                  style: const TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  w.className ?? 'No Assigned Class',
                  style: const TextStyle(
                    color: AppColors.textSecondary,
                    fontSize: 16,
                  ),
                ),
                const SizedBox(height: 32),

                Container(
                  padding: const EdgeInsets.all(24),
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
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(LucideIcons.wallet, color: balanceColor),
                          const SizedBox(width: 12),
                          const Text(
                            'Financial Status',
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      Text(
                        balanceText,
                        style: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w600,
                          color: balanceColor,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        statusHint,
                        style: const TextStyle(color: AppColors.textSecondary),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 24),

                GridView.count(
                  crossAxisCount: 2,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  mainAxisSpacing: 16,
                  crossAxisSpacing: 16,
                  childAspectRatio: 1.1,
                  children: [
                    _actionCard(
                      icon: LucideIcons.fileSpreadsheet,
                      title: 'Academic\nReports',
                      color: AppColors.primary,
                      onTap: () {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('Academic reports opening...'),
                          ),
                        );
                      },
                    ),
                    _actionCard(
                      icon: LucideIcons.receipt,
                      title: 'Payment\nReceipts',
                      color: Colors.teal,
                      onTap: () => context.push('/parent-receipts'),
                    ),
                    _actionCard(
                      icon: LucideIcons.calendarCheck,
                      title: 'Attendance\nHistory',
                      color: Colors.orange,
                      onTap: () {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('Attendance opening...'),
                          ),
                        );
                      },
                    ),
                    _actionCard(
                      icon: LucideIcons.heartPulse,
                      title: 'Medical\nRecords',
                      color: AppColors.error,
                      onTap: () {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('Medical records opening...'),
                          ),
                        );
                      },
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text(
          'Ward Profile',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: AppColors.secondary,
      ),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              LucideIcons.user,
              size: 56,
              color: AppColors.textSecondary.withValues(alpha: 0.3),
            ),
            const SizedBox(height: 16),
            const Text(
              'Ward profile not available.',
              style: TextStyle(color: AppColors.textSecondary, fontSize: 14),
            ),
          ],
        ),
      ),
    );
  }
}
