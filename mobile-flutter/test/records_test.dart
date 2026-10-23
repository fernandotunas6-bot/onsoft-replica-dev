import 'package:flutter_test/flutter_test.dart';
import 'package:siga_plus_flutter/records.dart';

Map<String, dynamic> feed(List<Map<String, dynamic>> items, {Object? cursor}) =>
    {'version': 1, 'items': items, 'nextCursor': cursor};

Map<String, dynamic> notice({
  String id = 'a1',
  String title = 'Reunião',
  String published = '2026-10-15T08:00:00Z',
  Object? category = 'Geral',
  Object? read = false,
}) => {
  'id': id,
  'title': title,
  'body': 'Sábado às 9h.',
  'publishedAt': published,
  'category': category,
  'read': read,
};

Map<String, dynamic> grade({
  String status = 'published',
  Object? value = 14,
  Object? scaleMax = 20,
  Object? publishedAt = '2026-10-10T10:00:00Z',
  String term = 'I Trimestre',
  String subject = 'Matemática',
}) => {
  'id': 'g1',
  'classSubjectId': 'cs1',
  'subjectName': subject,
  'termName': term,
  'kind': 'Prova',
  'status': status,
  'value': value,
  'scaleMax': scaleMax,
  'publishedAt': publishedAt,
};

void main() {
  test('notices arrive newest first and declare further pages', () {
    final parsed = NoticeFeed.parse(
      feed([
        notice(id: 'a1', published: '2026-10-01T08:00:00Z'),
        notice(id: 'a2', published: '2026-10-15T08:00:00Z'),
      ], cursor: 'cursor-opaco'),
    );
    expect(parsed.items.map((item) => item.id), ['a2', 'a1']);
    expect(parsed.hasMore, isTrue);
    expect(NoticeFeed.parse(feed([notice()])).hasMore, isFalse);
  });

  test('a notice outside the contract is not an empty feed', () {
    for (final broken in [
      notice(title: ''),
      notice(published: 'sábado'),
      notice(read: 'sim'),
      notice(category: 7),
    ]) {
      expect(
        () => NoticeFeed.parse(feed([broken])),
        throwsA(isA<FormatException>()),
        reason: broken.toString(),
      );
    }
    expect(
      () => NoticeFeed.parse({'version': 1}),
      throwsA(isA<FormatException>()),
    );
    expect(
      () => NoticeFeed.parse(feed([notice()])..['version'] = 2),
      throwsA(isA<FormatException>()),
    );
  });

  test('a published grade is read in the scale the school sent', () {
    final sheet = ResultSheet.parse(
      feed([grade(value: 14, scaleMax: 20), grade(value: 8.5, scaleMax: 10)]),
    );
    expect(sheet.items.first.display, '14 / 20');
    expect(sheet.items.last.display, '8.50 / 10');
  });

  test('a pending grade shows no number at all', () {
    final sheet = ResultSheet.parse(
      feed([
        grade(
          status: 'pending',
          value: null,
          scaleMax: null,
          publishedAt: null,
        ),
      ]),
    );
    expect(sheet.items.single.published, isFalse);
    expect(sheet.items.single.value, isNull);
    expect(sheet.items.single.display, 'Por publicar');
  });

  test('a draft travelling with a mark is refused, not displayed', () {
    expect(
      () => ResultSheet.parse(
        feed([grade(status: 'pending', value: 9, publishedAt: null)]),
      ),
      throwsA(isA<FormatException>()),
    );
  });

  test('no scale is ever assumed for a published grade', () {
    for (final broken in [
      grade(scaleMax: null),
      grade(scaleMax: 0),
      grade(value: null),
      grade(value: 21, scaleMax: 20),
      grade(value: -1),
      grade(publishedAt: null),
      grade(status: 'rascunho'),
    ]) {
      expect(
        () => ResultSheet.parse(feed([broken])),
        throwsA(isA<FormatException>()),
        reason: broken.toString(),
      );
    }
  });

  test('results keep the order of terms the server sent', () {
    final sheet = ResultSheet.parse(
      feed([
        grade(term: 'II Trimestre', subject: 'Física'),
        grade(term: 'I Trimestre', subject: 'Matemática'),
        grade(term: 'II Trimestre', subject: 'Química'),
      ]),
    );
    expect(sheet.byTerm.keys, ['II Trimestre', 'I Trimestre']);
    expect(sheet.byTerm['II Trimestre']!.length, 2);
  });
}
