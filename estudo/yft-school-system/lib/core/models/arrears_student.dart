class ArrearsStudent {
  final String id;
  final String name;
  final String classId;
  final double balance;
  final String? className;

  const ArrearsStudent({
    required this.id,
    required this.name,
    required this.classId,
    required this.balance,
    this.className,
  });

  factory ArrearsStudent.fromJson(Map<String, dynamic> json) {
    return ArrearsStudent(
      id: json['id'] as String,
      name: json['name'] as String,
      classId: json['class_id'] as String,
      balance: (json['balance'] as num).toDouble(),
      className: json['class_name'] as String?,
    );
  }

  double get amountOwed => balance.abs();
}
