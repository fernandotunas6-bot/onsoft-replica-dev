class TeacherProfile {
  final String uid;
  final String schoolId;
  final String role;
  final String name;
  final String? phone;
  final String? email;
  final String? staffId;
  final String? createdAt;
  final String? photoUrl;
  final String? residentialAddress;
  final String? qualification;
  final int? yearsExperience;
  final String? subjectsText;
  final String? ssnitNumber;
  final String? maritalStatus;
  final String? emergencyContactName;
  final String? emergencyContactPhone;
  final String? bankName;
  final String? bankAccountNumber;
  final String? bankAccountHolder;
  final String? dateOfBirth;
  final String? gender;

  const TeacherProfile({
    required this.uid,
    required this.schoolId,
    required this.role,
    required this.name,
    this.phone,
    this.email,
    this.staffId,
    this.createdAt,
    this.photoUrl,
    this.residentialAddress,
    this.qualification,
    this.yearsExperience,
    this.subjectsText,
    this.ssnitNumber,
    this.maritalStatus,
    this.emergencyContactName,
    this.emergencyContactPhone,
    this.bankName,
    this.bankAccountNumber,
    this.bankAccountHolder,
    this.dateOfBirth,
    this.gender,
  });

  factory TeacherProfile.fromJson(Map<String, dynamic> json) {
    return TeacherProfile(
      uid: json['uid'] as String,
      schoolId: json['school_id'] as String,
      role: json['role'] as String,
      name: json['name'] as String,
      phone: json['phone'] as String?,
      email: json['email'] as String?,
      staffId: json['staff_id'] as String?,
      createdAt: json['created_at'] as String?,
      photoUrl: json['photo_url'] as String?,
      residentialAddress: json['residential_address'] as String?,
      qualification: json['qualification'] as String?,
      yearsExperience: (json['years_experience'] as num?)?.toInt(),
      subjectsText: json['subjects_text'] as String?,
      ssnitNumber: json['ssnit_number'] as String?,
      maritalStatus: json['marital_status'] as String?,
      emergencyContactName: json['emergency_contact_name'] as String?,
      emergencyContactPhone: json['emergency_contact_phone'] as String?,
      bankName: json['bank_name'] as String?,
      bankAccountNumber: json['bank_account_number'] as String?,
      bankAccountHolder: json['bank_account_holder'] as String?,
      dateOfBirth: json['date_of_birth'] as String?,
      gender: json['gender'] as String?,
    );
  }
}
