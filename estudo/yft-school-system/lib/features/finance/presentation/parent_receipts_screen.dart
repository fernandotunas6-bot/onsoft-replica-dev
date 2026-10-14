import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/models/fee_receipt.dart';
import 'package:yft_school_system/core/settings/academic_year_state.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/utils/currency_display.dart';
import 'package:yft_school_system/features/finance/presentation/fee_receipt_view_screen.dart';
import 'package:yft_school_system/features/finance/presentation/providers/parent_receipts_provider.dart';

class ParentReceiptsScreen extends ConsumerWidget {
  const ParentReceiptsScreen({super.key});

  String _formatWhen(String raw) {
    if (raw.isEmpty) return '—';
    return raw.replaceFirst('T', ' ').split('.').first;
  }

  void _openDetail(BuildContext context, WidgetRef ref, FeeReceipt r) {
    final cal = ref.read(academicYearProvider);
    final displayYear = r.academicYear?.trim().isNotEmpty == true
        ? r.academicYear!.trim()
        : (cal.academicYear.trim().isNotEmpty ? cal.academicYear.trim() : '—');
    final displayTerm = r.feeTerm?.trim().isNotEmpty == true
        ? r.feeTerm!.trim()
        : (cal.activeTerm.trim().isNotEmpty ? cal.activeTerm.trim() : '—');

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => DraggableScrollableSheet(
        initialChildSize: 0.5,
        minChildSize: 0.35,
        maxChildSize: 0.92,
        builder: (_, scroll) => Container(
          decoration: const BoxDecoration(
            color: AppColors.background,
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          ),
          padding: const EdgeInsets.fromLTRB(24, 16, 24, 24),
          child: ListView(
            controller: scroll,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: AppColors.textSecondary.withValues(alpha: 0.25),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                'Receipt ${r.id}',
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: AppColors.secondary,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                _formatWhen(r.createdAt),
                style: const TextStyle(
                  color: AppColors.textSecondary,
                  fontSize: 13,
                ),
              ),
              const SizedBox(height: 20),
              _detailRow('Academic year', displayYear),
              _detailRow('Fee term', displayTerm),
              if (r.studentName != null && r.studentName!.isNotEmpty)
                _detailRow('Student', r.studentName!),
              _detailRow(
                'Amount received',
                formatMoneyDisplay(r.currency, r.amountPaid),
                labelColor: AppColors.primaryOnLight,
                valueColor: AppColors.primaryOnLight,
              ),
              if (r.creditAdded > 0)
                _detailRow(
                  'Credit / advance balance added',
                  formatMoneyDisplay(r.currency, r.creditAdded),
                  labelColor: AppColors.primaryOnLight,
                  valueColor: AppColors.primaryOnLight,
                ),
              _detailRow(
                'Account balance after payment',
                formatMoneyDisplay(r.currency, r.balanceAfter),
                valueColor: r.balanceAfter < 0
                    ? AppColors.error
                    : (r.balanceAfter > 0
                        ? AppColors.primaryOnLight
                        : null),
              ),
              if (r.balanceAfter < 0)
                _detailRow(
                  'Outstanding after this payment',
                  formatMoneyDisplay(r.currency, r.balanceAfter.abs()),
                  labelColor: AppColors.error,
                  valueColor: AppColors.error,
                ),
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton.icon(
                  onPressed: () {
                    Navigator.of(ctx).pop();
                    Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => FeeReceiptViewScreen(receipt: r),
                      ),
                    );
                  },
                  icon: const Icon(LucideIcons.fileText, size: 20),
                  label: const Text(
                    'View formal receipt',
                    style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(),
                child: const Text('Close'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _detailRow(
    String label,
    String value, {
    Color? labelColor,
    Color? valueColor,
  }) {
    final lc = labelColor ?? AppColors.textSecondary;
    final vc = valueColor;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 148,
            child: Text(
              label,
              style: TextStyle(
                color: lc,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          Expanded(
            child: SelectableText(
              value,
              style: TextStyle(
                fontWeight: FontWeight.w600,
                color: vc,
              ),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(parentReceiptsProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text(
          'Receipts',
          style: TextStyle(fontWeight: FontWeight.bold),
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
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'Could not load receipts.',
                  style: TextStyle(color: AppColors.error),
                ),
                const SizedBox(height: 12),
                TextButton(
                  onPressed: () => ref.invalidate(parentReceiptsProvider),
                  child: const Text('Retry'),
                ),
              ],
            ),
          ),
        ),
        data: (list) {
          if (list.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    LucideIcons.receipt,
                    size: 56,
                    color: AppColors.textSecondary.withValues(alpha: 0.3),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'No receipts yet.',
                    style: TextStyle(
                      color: AppColors.textSecondary,
                      fontSize: 14,
                    ),
                  ),
                ],
              ),
            );
          }
          return RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(parentReceiptsProvider);
              await ref.read(parentReceiptsProvider.future);
            },
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
              itemCount: list.length,
              separatorBuilder: (_, _) => const SizedBox(height: 10),
              itemBuilder: (context, i) {
                final r = list[i];
                final title = r.studentName?.isNotEmpty == true
                    ? r.studentName!
                    : 'Fee receipt';
                final subtitle =
                    '${formatMoneyDisplay(r.currency, r.amountPaid)} · ${_formatWhen(r.createdAt)}';
                return Material(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(16),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(16),
                    onTap: () => _openDetail(context, ref, r),
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: AppColors.primary.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: const Icon(
                              LucideIcons.receipt,
                              color: AppColors.primary,
                              size: 22,
                            ),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  title,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.bold,
                                    fontSize: 15,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  subtitle,
                                  style: const TextStyle(
                                    color: AppColors.textSecondary,
                                    fontSize: 13,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const Icon(
                            Icons.chevron_right,
                            color: AppColors.textSecondary,
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }
}
