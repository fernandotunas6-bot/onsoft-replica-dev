class FeeReceipt {
  final String id;
  final String schoolId;
  final String studentId;
  final String? parentUid;
  final String transactionId;
  final double amountPaid;
  final double balanceBefore;
  final double balanceAfter;
  final double amountToDebt;
  final double creditAdded;
  final String currency;
  final String? studentName;
  final String? description;
  final String createdAt;
  /// From school calendar when the payment was recorded.
  final String? academicYear;
  final String? feeTerm;

  const FeeReceipt({
    required this.id,
    required this.schoolId,
    required this.studentId,
    this.parentUid,
    required this.transactionId,
    required this.amountPaid,
    required this.balanceBefore,
    required this.balanceAfter,
    required this.amountToDebt,
    required this.creditAdded,
    required this.currency,
    this.studentName,
    this.description,
    required this.createdAt,
    this.academicYear,
    this.feeTerm,
  });

  factory FeeReceipt.fromJson(Map<String, dynamic> json) {
    return FeeReceipt(
      id: json['id'] as String,
      schoolId: json['school_id'] as String,
      studentId: json['student_id'] as String,
      parentUid: json['parent_uid'] as String?,
      transactionId: json['transaction_id'] as String,
      amountPaid: (json['amount_paid'] as num).toDouble(),
      balanceBefore: (json['balance_before'] as num).toDouble(),
      balanceAfter: (json['balance_after'] as num).toDouble(),
      amountToDebt: (json['amount_to_debt'] as num).toDouble(),
      creditAdded: (json['credit_added'] as num?)?.toDouble() ?? 0,
      currency: (json['currency'] as String?)?.trim().isNotEmpty == true
          ? json['currency'] as String
          : 'GHS',
      studentName: json['student_name'] as String?,
      description: json['description'] as String?,
      createdAt: json['created_at'] as String? ?? '',
      academicYear: json['academic_year'] as String?,
      feeTerm: json['fee_term'] as String?,
    );
  }
}
