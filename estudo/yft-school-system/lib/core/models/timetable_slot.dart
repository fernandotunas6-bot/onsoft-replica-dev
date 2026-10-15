/// Um tempo do horário semanal de uma turma.
class TimetableSlot {
  final String id;
  final String classId;
  final String className;
  final String? subjectId;
  final String? subjectName;
  final String? title;

  /// 1 = segunda … 7 = domingo, como [DateTime.weekday].
  final int weekday;

  /// "HH:MM", 24 h.
  final String startTime;
  final String endTime;
  final String? room;
  final String? teacherName;

  const TimetableSlot({
    required this.id,
    required this.classId,
    required this.className,
    this.subjectId,
    this.subjectName,
    this.title,
    required this.weekday,
    required this.startTime,
    required this.endTime,
    this.room,
    this.teacherName,
  });

  factory TimetableSlot.fromJson(Map<String, dynamic> j) => TimetableSlot(
    id: j['id'] as String,
    classId: j['class_id'] as String,
    className: j['class_name'] as String? ?? '',
    subjectId: j['subject_id'] as String?,
    subjectName: j['subject_name'] as String?,
    title: j['title'] as String?,
    weekday: (j['weekday'] as num).toInt(),
    startTime: j['start_time'] as String,
    endTime: j['end_time'] as String,
    room: j['room'] as String?,
    teacherName: j['teacher_name'] as String?,
  );

  /// Nome a mostrar: a disciplina, ou o título da pausa.
  String get label => subjectName ?? title ?? 'Tempo';

  bool get isBreak => subjectId == null;

  /// "09:00 – 10:30 · Sala 3".
  String get caption => [
    '$startTime – $endTime',
    if (room != null && room!.isNotEmpty) room!,
  ].join(' · ');

  int get startMinutes => _minutes(startTime);
  int get endMinutes => _minutes(endTime);

  static int _minutes(String hhmm) {
    final p = hhmm.split(':');
    return int.parse(p[0]) * 60 + int.parse(p[1]);
  }
}
