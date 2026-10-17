class ParentUser {
  final String uid;
  final String name;
  final String phone;
  final String? email;
  final int studentCount;

  const ParentUser({
    required this.uid,
    required this.name,
    required this.phone,
    this.email,
    this.studentCount = 0,
  });

  factory ParentUser.fromJson(Map<String, dynamic> json) {
    return ParentUser(
      uid: json['uid'] as String,
      name: json['name'] as String,
      phone: json['phone'] as String,
      email: json['email'] as String?,
      studentCount: (json['student_count'] as num?)?.toInt() ?? 0,
    );
  }
}
