class SchoolNotice {
  final String id;
  final String schoolId;
  final String? parentUid;
  final String title;
  final String summary;
  final String body;
  final String category;
  final String createdAt;
  final bool isRead;

  const SchoolNotice({
    required this.id,
    required this.schoolId,
    this.parentUid,
    required this.title,
    required this.summary,
    required this.body,
    required this.category,
    required this.createdAt,
    required this.isRead,
  });

  factory SchoolNotice.fromJson(Map<String, dynamic> json) {
    final readFlag = json['read_flag'];
    final read = readFlag is num
        ? readFlag != 0
        : readFlag == true;
    return SchoolNotice(
      id: json['id'] as String,
      schoolId: json['school_id'] as String,
      parentUid: json['parent_uid'] as String?,
      title: json['title'] as String,
      summary: json['summary'] as String,
      body: json['body'] as String,
      category: json['category'] as String? ?? 'general',
      createdAt: json['created_at'] as String? ?? '',
      isRead: read,
    );
  }
}
