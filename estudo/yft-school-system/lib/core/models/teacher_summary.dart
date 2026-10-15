/// Um professor na lista da escola (`GET /api/users/teachers`).
class TeacherSummary {
  final String uid;
  final String name;
  final String? email;
  final String? phone;
  final String? staffId;
  final String? photoUrl;
  final String? subjectsText;

  const TeacherSummary({
    required this.uid,
    required this.name,
    this.email,
    this.phone,
    this.staffId,
    this.photoUrl,
    this.subjectsText,
  });

  factory TeacherSummary.fromJson(Map<String, dynamic> j) => TeacherSummary(
    uid: j['uid'] as String,
    name: j['name'] as String,
    email: j['email'] as String?,
    phone: j['phone'] as String?,
    staffId: j['staff_id'] as String?,
    photoUrl: j['photo_url'] as String?,
    subjectsText: j['subjects_text'] as String?,
  );
}
