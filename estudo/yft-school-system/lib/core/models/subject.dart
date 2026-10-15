class Subject {
  final String id;
  final String schoolId;
  final String name;
  final List<String> classIds;
  final String? createdAt;

  const Subject({
    required this.id,
    required this.schoolId,
    required this.name,
    required this.classIds,
    this.createdAt,
  });

  factory Subject.fromJson(Map<String, dynamic> json) {
    final rawClassIds = json['class_ids'];
    List<String> classIds;
    if (rawClassIds is List) {
      classIds = rawClassIds.cast<String>();
    } else if (rawClassIds is String && rawClassIds.isNotEmpty) {
      classIds = rawClassIds.split(',');
    } else {
      classIds = [];
    }

    return Subject(
      id: json['id'] as String,
      schoolId: json['school_id'] as String,
      name: json['name'] as String,
      classIds: classIds,
      createdAt: json['created_at'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'name': name,
        'class_ids': classIds,
      };
}
