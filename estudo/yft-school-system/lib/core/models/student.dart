class Student {
  final String id;
  final String schoolId;
  final String classId;
  final String? parentUid;
  final String name;
  final String? dob;
  final String? gender;
  final double balance;
  final String? createdAt;
  final String? className;
  final String? parentName;
  final String? parentPhone;
  final String? parentEmail;
  final String? photoUrl;
  final String? previousSchool;
  final String? address;
  final String? emergencyContactName;
  final String? emergencyContactPhone;
  final String? bloodGroup;
  final String? medicalNotes;
  /// When false, student is hidden from parent app wards list.
  final bool isActive;

  const Student({
    required this.id,
    required this.schoolId,
    required this.classId,
    this.parentUid,
    required this.name,
    this.dob,
    this.gender,
    this.balance = 0,
    this.createdAt,
    this.className,
    this.parentName,
    this.parentPhone,
    this.parentEmail,
    this.photoUrl,
    this.previousSchool,
    this.address,
    this.emergencyContactName,
    this.emergencyContactPhone,
    this.bloodGroup,
    this.medicalNotes,
    this.isActive = true,
  });

  factory Student.fromJson(Map<String, dynamic> json) {
    return Student(
      id: json['id'] as String,
      schoolId: json['school_id'] as String,
      classId: json['class_id'] as String,
      parentUid: json['parent_uid'] as String?,
      name: json['name'] as String,
      dob: json['dob'] as String?,
      gender: json['gender'] as String?,
      balance: (json['balance'] as num?)?.toDouble() ?? 0,
      createdAt: json['created_at'] as String?,
      className: json['class_name'] as String?,
      parentName: json['parent_name'] as String?,
      parentPhone: json['parent_phone'] as String?,
      parentEmail: json['parent_email'] as String?,
      photoUrl: json['photo_url'] as String?,
      previousSchool: json['previous_school'] as String?,
      address: json['address'] as String?,
      emergencyContactName: json['emergency_contact_name'] as String?,
      emergencyContactPhone: json['emergency_contact_phone'] as String?,
      bloodGroup: json['blood_group'] as String?,
      medicalNotes: json['medical_notes'] as String?,
      isActive: _parseBool(json['is_active'], defaultValue: true),
    );
  }

  static bool _parseBool(Object? v, {required bool defaultValue}) {
    if (v == null) return defaultValue;
    if (v is bool) return v;
    if (v is num) return v != 0;
    if (v is String) {
      final s = v.toLowerCase();
      if (s == '0' || s == 'false') return false;
      if (s == '1' || s == 'true') return true;
    }
    return defaultValue;
  }

  Map<String, dynamic> toJson() => {
        'name': name,
        'class_id': classId,
        if (dob != null) 'dob': dob,
        if (gender != null) 'gender': gender,
        if (balance != 0) 'balance': balance,
        'parent': {
          'name': parentName ?? '',
          'phone': parentPhone ?? '',
          if (parentEmail != null) 'email': parentEmail,
        },
      };

  bool get hasDebt => balance < 0;
  bool get isOverpaid => balance > 0;
  bool get isCleared => balance == 0;
}
