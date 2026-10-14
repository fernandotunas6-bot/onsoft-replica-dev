import 'package:yft_school_system/core/auth/auth_state.dart';
import 'package:yft_school_system/core/models/fee_receipt.dart';
import 'package:yft_school_system/core/utils/media_url.dart';

/// Branding + transaction data for formal fee receipts (screen + PDF).
class FeeReceiptTemplateData {
  final String schoolName;
  final String? logoFullUrl;
  final String? address;
  final String? email;
  final String? phone;
  final String? motto;
  final FeeReceipt receipt;

  /// When [receipt] has no stored period (legacy rows), use app calendar from `/me` flow.
  final String? calendarAcademicYear;
  final String? calendarFeeTerm;

  const FeeReceiptTemplateData({
    required this.schoolName,
    this.logoFullUrl,
    this.address,
    this.email,
    this.phone,
    this.motto,
    required this.receipt,
    this.calendarAcademicYear,
    this.calendarFeeTerm,
  });

  /// Academic year for display: persisted on receipt, else school calendar snapshot.
  String get displayAcademicYear {
    final stored = receipt.academicYear?.trim();
    if (stored != null && stored.isNotEmpty) return stored;
    final cal = calendarAcademicYear?.trim();
    if (cal != null && cal.isNotEmpty) return cal;
    return '—';
  }

  /// Fee term for display: persisted on receipt, else school calendar snapshot.
  String get displayFeeTerm {
    final stored = receipt.feeTerm?.trim();
    if (stored != null && stored.isNotEmpty) return stored;
    final cal = calendarFeeTerm?.trim();
    if (cal != null && cal.isNotEmpty) return cal;
    return '—';
  }

  /// Builds branding from [AppSession] (from `/users/me`) and API base URL.
  factory FeeReceiptTemplateData.fromSession(
    FeeReceipt receipt,
    AppSession? session,
    String apiBaseUrl, {
    String? calendarAcademicYear,
    String? calendarFeeTerm,
  }) {
    final name = session?.schoolName?.trim().isNotEmpty == true
        ? session!.schoolName!.trim()
        : 'School';
    return FeeReceiptTemplateData(
      schoolName: name,
      logoFullUrl: profilePhotoUrlFromKey(session?.schoolLogoUrl, apiBaseUrl),
      address: session?.schoolAddress,
      email: session?.schoolEmail,
      phone: session?.schoolPhone,
      motto: session?.schoolMotto,
      receipt: receipt,
      calendarAcademicYear: calendarAcademicYear,
      calendarFeeTerm: calendarFeeTerm,
    );
  }
}
