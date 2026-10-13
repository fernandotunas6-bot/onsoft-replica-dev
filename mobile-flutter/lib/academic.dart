/// UTC+1 is the institutional display timezone for Angola. Device timezone
/// never decides which timetable day is shown. A slot is not proof of attendance.
DateTime luandaClock(DateTime instant) => instant.toUtc().add(const Duration(hours: 1));
String dayKey(DateTime day) => '${day.year.toString().padLeft(4, '0')}-${day.month.toString().padLeft(2, '0')}-${day.day.toString().padLeft(2, '0')}';

class AcademicCatalog {
  AcademicCatalog(this.classes, this.slots, this.tasks);
  final List<Map<String, dynamic>> classes;
  final List<Map<String, dynamic>> slots;
  final List<Map<String, dynamic>> tasks;
  factory AcademicCatalog.parse(Map<String, dynamic> data) {
    List<Map<String, dynamic>> list(String key) {
      final value = data[key];
      if (value is! List || value.length > 1000 || value.any((v) => v is! Map<String, dynamic>)) {
        throw const FormatException('Catálogo académico inválido.');
      }
      return value.cast<Map<String, dynamic>>();
    }
    final classes = list('classes');
    final slots = list('timetable');
    final tasks = list('tasks');
    final ids = <String>{};
    for (final c in classes) {
      if (c['classSubjectId'] is! String || c['subjectName'] is! String ||
          c['className'] is! String || c['classGroupId'] is! String || !ids.add(c['classSubjectId'] as String)) {
        throw const FormatException('Disciplina inválida.');
      }
    }
    for (final s in slots) {
      if (!ids.contains(s['classSubjectId']) || s['weekday'] is! int ||
          (s['weekday'] as int) < 1 || (s['weekday'] as int) > 7 ||
          minutes(s['startsAt']) == null || minutes(s['endsAt']) == null ||
          minutes(s['startsAt'])! >= minutes(s['endsAt'])! ||
          !{'published', 'legacy'}.contains(s['publication'])) {
        throw const FormatException('Horário inválido.');
      }
      for (final key in ['validFrom', 'validTo']) {
        if (s[key] != null && (s[key] is! String || !RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(s[key] as String) || DateTime.tryParse(s[key] as String) == null)) {
          throw const FormatException('Validade do horário inválida.');
        }
      }
    }
    for (final t in tasks) {
      if (!ids.contains(t['classSubjectId']) || t['title'] is! String ||
          (t['due'] != null && (t['due'] is! String || DateTime.tryParse(t['due'] as String) == null))) {
        throw const FormatException('Tarefa inválida.');
      }
    }
    return AcademicCatalog(classes, slots, tasks);
  }
  String subject(dynamic id) => classes.firstWhere((c) => c['classSubjectId'] == id)['subjectName'] as String;
  List<Map<String, dynamic>> forDay(DateTime day, {bool publishedOnly = false}) {
    final key = dayKey(day);
    final found = slots.where((s) => s['weekday'] == day.weekday &&
      (!publishedOnly || s['publication'] == 'published') &&
      (s['validFrom'] == null || (s['validFrom'] as String).substring(0,10).compareTo(key) <= 0) &&
      (s['validTo'] == null || (s['validTo'] as String).substring(0,10).compareTo(key) >= 0)).toList();
    found.sort((a,b) => minutes(a['startsAt'])!.compareTo(minutes(b['startsAt'])!));
    return found;
  }
  Map<String, dynamic>? upcoming(DateTime utcNow) {
    final now = luandaClock(utcNow);
    final today = forDay(now, publishedOnly: true);
    for (final slot in today) {
      if (minutes(slot['endsAt'])! > now.hour * 60 + now.minute) return slot;
    }
    return null;
  }
}
int? minutes(dynamic time) {
  if (time is! String || !RegExp(r'^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$').hasMatch(time)) return null;
  return int.parse(time.substring(0,2)) * 60 + int.parse(time.substring(3,5));
}
