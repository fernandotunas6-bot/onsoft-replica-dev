import 'package:flutter_test/flutter_test.dart';
import 'package:siga_plus_flutter/records.dart';

Map<String, dynamic> grades() => {
  'items': <Map<String, dynamic>>[
    {
      'classSubjectId': 'math',
      'subjectName': 'Matemática',
      'termId': 't1',
      'termName': '1.º Trimestre',
      'publication': 'published',
      'scaleMax': 20,
      'finalGrade': 14,
      'status': 'APROVADO',
      'grades': [
        {'code': 'MAC', 'label': 'MAC', 'value': 13},
        {'code': 'NPP', 'label': 'NPP', 'value': null},
      ],
    },
    {
      'classSubjectId': 'math',
      'subjectName': 'Matemática',
      'termId': 't2',
      'termName': '2.º Trimestre',
      'publication': 'published',
      'scaleMax': 20,
      'finalGrade': null,
      'status': null,
      'grades': [],
    },
  ],
};
Map<String, dynamic> feed() => {
  'nextCursor': 'next-page',
  'items': <Map<String, dynamic>>[
    {
      'id': 'a',
      'title': 'Reunião',
      'body': 'Convocatória',
      'publishedAt': '2026-10-10T08:00:00Z',
      'audience': 'school',
      'classSubjectId': null,
      'subjectName': null,
      'pinned': false,
    },
    {
      'id': 'b',
      'title': 'Teste',
      'body': 'Aviso da turma',
      'publishedAt': '2026-10-09T08:00:00Z',
      'audience': 'class',
      'classSubjectId': 'math',
      'subjectName': 'Matemática',
      'pinned': true,
    },
  ],
};
final now = DateTime.parse('2026-10-13T08:00:00Z');
void main() {
  test('terms keep the order the school published and group by term', () {
    final report = GradeReport.parse(grades());
    expect(report.terms, ['1.º Trimestre', '2.º Trimestre']);
    expect(report.forTerm('2.º Trimestre').single['finalGrade'], isNull);
  });
  test('a mark is shown in the scale the school sent and never invented', () {
    expect(GradeReport.mark(13, 20), '13/20');
    expect(GradeReport.mark(null, 20), '—');
    expect(GradeReport.mark(12.5, 20), '12.5/20');
  });
  test('unpublished marks do not become a visible empty report', () {
    final data = grades();
    (data['items'] as List).first['publication'] = 'draft';
    expect(() => GradeReport.parse(data), throwsFormatException);
  });
  test('a grade above the communicated scale is refused', () {
    final data = grades();
    ((data['items'] as List).first['grades'] as List).first['value'] = 34;
    expect(() => GradeReport.parse(data), throwsFormatException);
  });
  test('repeated subject and term cannot duplicate an evaluation', () {
    final data = grades();
    (data['items'] as List)[1] = (data['items'] as List).first;
    expect(() => GradeReport.parse(data), throwsFormatException);
  });
  test('pinned notices come first and the rest by publication date', () {
    final ordered = NoticeFeed.parse(feed(), now).ordered();
    expect(ordered.first['id'], 'b');
    expect(ordered.last['id'], 'a');
  });
  test('a notice scheduled for later is refused rather than displayed', () {
    final data = feed();
    (data['items'] as List).first['publishedAt'] = '2026-10-14T08:00:00Z';
    expect(() => NoticeFeed.parse(data, now), throwsFormatException);
  });
  test('a class notice without its authorized subject is refused', () {
    final data = feed();
    (data['items'] as List)[1]['classSubjectId'] = null;
    expect(() => NoticeFeed.parse(data, now), throwsFormatException);
  });
  test('a repeated cursor cannot loop the feed', () {
    expect(
      () => NoticeFeed.parse(feed(), now, cursor: 'next-page'),
      throwsFormatException,
    );
  });
  test('merging a page keeps the notices already shown without duplicates', () {
    final first = NoticeFeed.parse(feed(), now);
    final second = NoticeFeed.parse({...feed(), 'nextCursor': null}, now);
    final merged = first.merge(second);
    expect(merged.items.length, 2);
    expect(merged.nextCursor, isNull);
  });
}
