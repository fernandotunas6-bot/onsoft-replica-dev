class PaymentResult {
  final String id;
  final String? receiptId;
  final String studentId;
  final double amount;
  final double balance;
  final double? balanceBefore;
  final double? amountToDebt;
  final double? creditAdded;
  final String? currency;
  final bool? noticeCreated;

  const PaymentResult({
    required this.id,
    this.receiptId,
    required this.studentId,
    required this.amount,
    required this.balance,
    this.balanceBefore,
    this.amountToDebt,
    this.creditAdded,
    this.currency,
    this.noticeCreated,
  });

  double get creditAddedOrZero => creditAdded ?? 0;

  factory PaymentResult.fromJson(Map<String, dynamic> json) {
    return PaymentResult(
      id: json['id'] as String,
      receiptId: json['receipt_id'] as String?,
      studentId: json['student_id'] as String,
      amount: (json['amount'] as num).toDouble(),
      balance: (json['balance'] as num).toDouble(),
      balanceBefore: (json['balance_before'] as num?)?.toDouble(),
      amountToDebt: (json['amount_to_debt'] as num?)?.toDouble(),
      creditAdded: (json['credit_added'] as num?)?.toDouble(),
      currency: json['currency'] as String?,
      noticeCreated: json['notice_created'] as bool?,
    );
  }
}
