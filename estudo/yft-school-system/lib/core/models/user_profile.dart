class UserProfile {
  final String uid;
  final String schoolId;
  final String role;
  final String name;
  final String? phone;
  final String? email;
  final String? createdAt;

  const UserProfile({
    required this.uid,
    required this.schoolId,
    required this.role,
    required this.name,
    this.phone,
    this.email,
    this.createdAt,
  });

  factory UserProfile.fromJson(Map<String, dynamic> json) {
    return UserProfile(
      uid: json['uid'] as String,
      schoolId: json['school_id'] as String? ?? json['schoolId'] as String,
      role: json['role'] as String,
      name: json['name'] as String,
      phone: json['phone'] as String?,
      email: json['email'] as String?,
      createdAt: json['created_at'] as String?,
    );
  }
}
