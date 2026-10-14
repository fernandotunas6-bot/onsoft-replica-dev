class SchoolClass {
  final String id;
  final String schoolId;
  final String className;
  final int? level;
  final double feeAmount;
  final String feeCollectionCycle;
  final String? feeLastAppliedPeriod;
  final String? createdAt;

  const SchoolClass({
    required this.id,
    required this.schoolId,
    required this.className,
    this.level,
    this.feeAmount = 0,
    this.feeCollectionCycle = 'term',
    this.feeLastAppliedPeriod,
    this.createdAt,
  });

  factory SchoolClass.fromJson(Map<String, dynamic> json) {
    return SchoolClass(
      id: json['id'] as String,
      schoolId: json['school_id'] as String,
      className: json['class_name'] as String,
      level: json['level'] as int?,
      feeAmount: (json['fee_amount'] as num?)?.toDouble() ?? 0,
      feeCollectionCycle: (json['fee_collection_cycle'] as String?) ?? 'term',
      feeLastAppliedPeriod: json['fee_last_applied_period'] as String?,
      createdAt: json['created_at'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
    'class_name': className,
    if (level != null) 'level': level,
    if (feeAmount != 0) 'fee_amount': feeAmount,
    if (feeCollectionCycle.isNotEmpty)
      'fee_collection_cycle': feeCollectionCycle,
  };

  bool get hasFeeStructure => feeAmount > 0;
}
