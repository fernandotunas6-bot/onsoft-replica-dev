import 'package:flutter_test/flutter_test.dart';
import 'package:siga_plus_flutter/academic.dart';

Map<String, dynamic> fixture() => {
  'classes': [
    {
      'classSubjectId': 'math',
      'classGroupId': 'class-a',
      'subjectName': 'Matemática',
      'className': '10.ª Classe',
    },
  ],
  'timetable': [
    {
      'classSubjectId': 'math',
      'weekday': 2,
      'startsAt': '09:00',
      'endsAt': '10:30',
      'publication': 'published',
      'validFrom': '2026-10-01',
      'validTo': '2026-10-31',
    },
    {
      'classSubjectId': 'math',
      'weekday': 2,
      'startsAt': '08:00',
      'endsAt': '08:30',
      'publication': 'legacy',
      'validFrom': null,
      'validTo': null,
    },
  ],
  'tasks': [],
};
void main() {
  test('Luanda weekday follows UTC+1 across midnight', () {
    final clock = luandaClock(DateTime.parse('2026-10-12T23:30:00Z'));
    expect(clock.weekday, 2);
    expect(clock.day, 13);
  });
  test('upcoming only uses published slots and excludes ended lessons', () {
    final catalog = AcademicCatalog.parse(fixture());
    expect(
      catalog.upcoming(DateTime.parse('2026-10-13T07:00:00Z'))?['startsAt'],
      '09:00',
    );
    expect(catalog.upcoming(DateTime.parse('2026-10-13T09:30:00Z')), isNull);
  });
  test('validity prevents recurring expired schedules', () {
    final catalog = AcademicCatalog.parse(fixture());
    expect(
      catalog.forDay(DateTime.utc(2026, 11, 3), publishedOnly: true),
      isEmpty,
    );
  });
  test('missing arrays cannot silently become empty academic data', () {
    expect(() => AcademicCatalog.parse({'classes': []}), throwsFormatException);
  });
  test('rejects a slot pointing outside the catalog', () {
    final data = fixture();
    (data['timetable'] as List).first['classSubjectId'] = 'foreign';
    expect(() => AcademicCatalog.parse(data), throwsFormatException);
  });
}
