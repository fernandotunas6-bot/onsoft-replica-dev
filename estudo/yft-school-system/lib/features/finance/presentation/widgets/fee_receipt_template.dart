import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/utils/currency_display.dart';
import 'package:yft_school_system/features/finance/presentation/widgets/fee_receipt_template_data.dart';

/// Formal fee receipt layout: watermark logo, school header, itemized amounts.
/// Styling is conservative (dark slate, clear hierarchy) for institutional use.
class FeeReceiptTemplate extends StatelessWidget {
  final FeeReceiptTemplateData data;

  const FeeReceiptTemplate({super.key, required this.data});

  static const _border = Color(0xFF0F172A);
  static const _muted = Color(0xFF475569);
  static const _surface = Color(0xFFF8FAFC);

  String _formatWhen(String raw) {
    if (raw.isEmpty) return '—';
    return raw.replaceFirst('T', ' ').split('.').first;
  }

  @override
  Widget build(BuildContext context) {
    final r = data.receipt;
    final logoUrl = data.logoFullUrl;

    return LayoutBuilder(
      builder: (context, constraints) {
        return Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: Material(
              color: Colors.white,
              elevation: 2,
              shadowColor: Colors.black26,
              child: Stack(
                clipBehavior: Clip.hardEdge,
                children: [
                  if (logoUrl != null && logoUrl.isNotEmpty)
                    Positioned.fill(
                      child: IgnorePointer(
                        child: Opacity(
                          opacity: 0.055,
                          child: Center(
                            child: Image.network(
                              logoUrl,
                              width: 320,
                              height: 320,
                              fit: BoxFit.contain,
                              errorBuilder: (context, error, stackTrace) =>
                                  const SizedBox.shrink(),
                            ),
                          ),
                        ),
                      ),
                    ),
                  SingleChildScrollView(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 28,
                      vertical: 32,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.center,
                          children: [
                            if (logoUrl != null && logoUrl.isNotEmpty)
                              SizedBox(
                                width: 72,
                                height: 72,
                                child: Image.network(
                                  logoUrl,
                                  fit: BoxFit.contain,
                                  errorBuilder: (context, error, stackTrace) =>
                                      const SizedBox.shrink(),
                                ),
                              )
                            else
                              Container(
                                width: 72,
                                height: 72,
                                alignment: Alignment.center,
                                decoration: BoxDecoration(
                                  border: Border.all(
                                    color: _border.withValues(alpha: 0.2),
                                  ),
                                ),
                                child: Text(
                                  data.schoolName.isNotEmpty
                                      ? data.schoolName[0].toUpperCase()
                                      : 'S',
                                  style: GoogleFonts.libreBaskerville(
                                    fontSize: 28,
                                    fontWeight: FontWeight.w600,
                                    color: _border,
                                  ),
                                ),
                              ),
                            const SizedBox(height: 14),
                            Text(
                              data.schoolName.toUpperCase(),
                              textAlign: TextAlign.center,
                              style: GoogleFonts.libreBaskerville(
                                fontSize: 17,
                                fontWeight: FontWeight.w600,
                                color: _border,
                                letterSpacing: 0.6,
                                height: 1.25,
                              ),
                            ),
                            if (data.motto != null &&
                                data.motto!.trim().isNotEmpty) ...[
                              const SizedBox(height: 6),
                              Text(
                                data.motto!.trim(),
                                textAlign: TextAlign.center,
                                style: GoogleFonts.inter(
                                  fontSize: 12,
                                  fontStyle: FontStyle.italic,
                                  color: _muted,
                                  height: 1.35,
                                ),
                              ),
                            ],
                            const SizedBox(height: 10),
                            _contactLineCentered(
                              Icons.place_outlined,
                              data.address,
                            ),
                            _contactLineCentered(
                              Icons.email_outlined,
                              data.email,
                            ),
                            _contactLineCentered(
                              Icons.phone_outlined,
                              data.phone,
                            ),
                          ],
                        ),
                        const SizedBox(height: 28),
                        Container(height: 1, color: _border.withValues(alpha: 0.35)),
                        const SizedBox(height: 20),
                        Text(
                          'OFFICIAL FEE RECEIPT',
                          textAlign: TextAlign.center,
                          style: GoogleFonts.libreBaskerville(
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                            letterSpacing: 2.4,
                            color: _border,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          'This document acknowledges a recorded fee payment.',
                          textAlign: TextAlign.center,
                          style: GoogleFonts.inter(
                            fontSize: 11,
                            color: _muted,
                          ),
                        ),
                        const SizedBox(height: 24),
                        _line('Receipt number', r.id),
                        _line('Date & time', _formatWhen(r.createdAt)),
                        _line('Academic year', data.displayAcademicYear),
                        _line('Fee term', data.displayFeeTerm),
                        if (r.studentName != null && r.studentName!.trim().isNotEmpty)
                          _line('Student', r.studentName!.trim()),
                        _line(
                          'Amount received',
                          formatMoneyDisplay(r.currency, r.amountPaid),
                          labelColor: AppColors.primaryOnLight,
                          valueColor: AppColors.primaryOnLight,
                          accentRow: true,
                        ),
                        _line(
                          'Applied to outstanding fees',
                          formatMoneyDisplay(r.currency, r.amountToDebt),
                        ),
                        if (r.creditAdded > 0)
                          _line(
                            'Credit / advance balance added',
                            formatMoneyDisplay(r.currency, r.creditAdded),
                            labelColor: AppColors.primaryOnLight,
                            valueColor: AppColors.primaryOnLight,
                            accentRow: true,
                          ),
                        _line(
                          'Account balance before payment',
                          formatMoneyDisplay(r.currency, r.balanceBefore),
                        ),
                        _line(
                          'Account balance after payment',
                          formatMoneyDisplay(r.currency, r.balanceAfter),
                          valueColor: r.balanceAfter < 0
                              ? AppColors.error
                              : (r.balanceAfter > 0
                                  ? AppColors.primaryOnLight
                                  : _border),
                          accentRow: r.balanceAfter != 0,
                        ),
                        if (r.balanceAfter < 0)
                          _line(
                            'Outstanding after this payment',
                            formatMoneyDisplay(
                              r.currency,
                              r.balanceAfter.abs(),
                            ),
                            labelColor: AppColors.error,
                            valueColor: AppColors.error,
                          ),
                        _line('Transaction reference', r.transactionId),
                        if (r.description != null && r.description!.trim().isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(top: 8),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Notes',
                                  style: GoogleFonts.inter(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w600,
                                    color: _muted,
                                    letterSpacing: 0.5,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  r.description!.trim(),
                                  style: GoogleFonts.inter(
                                    fontSize: 12,
                                    color: _border.withValues(alpha: 0.85),
                                    height: 1.45,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        const SizedBox(height: 28),
                        Container(
                          padding: const EdgeInsets.all(14),
                          color: _surface,
                          child: Text(
                            'Retain this receipt for your records. For billing inquiries, '
                            'contact the school office using the details above. '
                            'This receipt is generated from the school management system.',
                            style: GoogleFonts.inter(
                              fontSize: 10,
                              color: _muted,
                              height: 1.5,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _contactLineCentered(IconData icon, String? text) {
    if (text == null || text.trim().isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: _muted),
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              text.trim(),
              textAlign: TextAlign.center,
              style: GoogleFonts.inter(
                fontSize: 11,
                color: _muted,
                height: 1.35,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _line(
    String label,
    String value, {
    Color? labelColor,
    Color? valueColor,
    bool accentRow = false,
  }) {
    final lc = labelColor ?? _muted;
    final vc = valueColor ?? _border;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            flex: 11,
            child: Text(
              label.toUpperCase(),
              style: GoogleFonts.inter(
                fontSize: 10,
                fontWeight: FontWeight.w600,
                letterSpacing: 0.4,
                color: lc,
              ),
            ),
          ),
          Expanded(
            flex: 14,
            child: SelectableText(
              value,
              style: GoogleFonts.inter(
                fontSize: accentRow ? 14 : 12,
                fontWeight:
                    accentRow ? FontWeight.w700 : FontWeight.w600,
                color: vc,
                height: 1.35,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
