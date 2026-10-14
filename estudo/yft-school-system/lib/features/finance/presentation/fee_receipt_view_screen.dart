import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:yft_school_system/core/auth/auth_state.dart';
import 'package:yft_school_system/core/models/fee_receipt.dart';
import 'package:yft_school_system/core/settings/academic_year_state.dart';
import 'package:yft_school_system/core/network/api_client.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/utils/responsive_utils.dart';
import 'package:yft_school_system/features/finance/presentation/fee_receipt_pdf.dart';
import 'package:yft_school_system/features/finance/presentation/widgets/fee_receipt_template.dart';
import 'package:yft_school_system/features/finance/presentation/widgets/fee_receipt_template_data.dart';
import 'dart:io';

/// Full-screen formal receipt with optional PDF download / share.
class FeeReceiptViewScreen extends ConsumerStatefulWidget {
  final FeeReceipt receipt;

  const FeeReceiptViewScreen({super.key, required this.receipt});

  @override
  ConsumerState<FeeReceiptViewScreen> createState() =>
      _FeeReceiptViewScreenState();
}

class _FeeReceiptViewScreenState extends ConsumerState<FeeReceiptViewScreen> {
  bool _sharing = false;

  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      ref.read(authProvider.notifier).refreshProfile();
    });
  }

  Future<void> _sharePdf(FeeReceiptTemplateData data) async {
    setState(() => _sharing = true);
    try {
      final bytes = await buildFeeReceiptPdf(data);
      final dir = await getTemporaryDirectory();
      final safeId = widget.receipt.id.replaceAll(RegExp(r'[^\w\-]+'), '_');
      final file = File('${dir.path}/fee_receipt_$safeId.pdf');
      await file.writeAsBytes(bytes, flush: true);
      await Share.shareXFiles(
        [XFile(file.path)],
        subject: 'Fee receipt ${widget.receipt.id}',
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Could not prepare PDF: $e'),
          backgroundColor: AppColors.error,
        ),
      );
    } finally {
      if (mounted) setState(() => _sharing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(authProvider);
    final base = ref.watch(dioProvider).options.baseUrl;
    final cal = ref.watch(academicYearProvider);
    final data = FeeReceiptTemplateData.fromSession(
      widget.receipt,
      session,
      base,
      calendarAcademicYear: cal.academicYear,
      calendarFeeTerm: cal.activeTerm,
    );

    return Scaffold(
      backgroundColor: const Color(0xFFE2E8F0),
      appBar: AppBar(
        title: const Text(
          'Fee receipt',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        backgroundColor: AppColors.background,
        elevation: 0,
        foregroundColor: AppColors.secondary,
        actions: [
          if (_sharing)
            const Padding(
              padding: EdgeInsets.only(right: 16),
              child: Center(
                child: SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            )
          else
            IconButton(
              tooltip: 'Download / share PDF',
              onPressed: () => _sharePdf(data),
              icon: const Icon(LucideIcons.download),
            ),
        ],
      ),
      body: SingleChildScrollView(
        padding: getResponsiveHorizontalPadding(context).copyWith(
          top: 24,
          bottom: 40,
        ),
        child: Center(
          child: FeeReceiptTemplate(data: data),
        ),
      ),
    );
  }
}
