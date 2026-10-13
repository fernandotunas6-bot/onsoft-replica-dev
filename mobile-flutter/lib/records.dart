/// Records parsing for institutional marks and notices. The server decides
/// authorization, publication and audience; this file only refuses to display
/// data that contradicts the contract, instead of showing a partial mark.
class GradeReport {
  GradeReport(this.items);
  final List<Map<String, dynamic>> items;
  factory GradeReport.parse(Map<String, dynamic> data) {
    final value = data['items'];
    if (value is! List ||
        value.length > 1000 ||
        value.any((v) => v is! Map<String, dynamic>)) {
      throw const FormatException('Pauta institucional inválida.');
    }
    final items = value.cast<Map<String, dynamic>>();
    final seen = <String>{};
    for (final item in items) {
      final scale = item['scaleMax'];
      if (item['classSubjectId'] is! String ||
          item['subjectName'] is! String ||
          item['termId'] is! String ||
          item['termName'] is! String ||
          item['publication'] != 'published' ||
          scale is! num ||
          scale <= 0 ||
          (item['status'] != null && item['status'] is! String) ||
          item['grades'] is! List ||
          !seen.add('${item['classSubjectId']}:${item['termId']}')) {
        throw const FormatException('Avaliação inválida.');
      }
      for (final grade in [
        ...item['grades'] as List,
        {'code': 'final', 'label': 'final', 'value': item['finalGrade']},
      ]) {
        final mark = grade is Map ? grade['value'] : null;
        if (grade is! Map ||
            grade['code'] is! String ||
            grade['label'] is! String ||
            (mark != null && (mark is! num || mark < 0 || mark > scale))) {
          throw const FormatException(
            'Nota fora da escala comunicada pela escola.',
          );
        }
      }
    }
    return GradeReport(items);
  }

  /// Terms as the school named them; no ordering is invented from the label.
  List<String> get terms {
    final found = <String>[];
    for (final item in items) {
      final name = item['termName'] as String;
      if (!found.contains(name)) found.add(name);
    }
    return found;
  }

  List<Map<String, dynamic>> forTerm(String termName) =>
      items.where((item) => item['termName'] == termName).toList()..sort(
        (a, b) =>
            (a['subjectName'] as String).compareTo(b['subjectName'] as String),
      );

  /// Formatting only: an average across subjects is a pedagogical rule of the
  /// school and is never computed on the device.
  static String mark(dynamic value, dynamic scale) => value is num
      ? '${value == value.roundToDouble() ? value.round() : value}/${scale is num ? (scale == scale.roundToDouble() ? scale.round() : scale) : '?'}'
      : '—';
}

class NoticeFeed {
  NoticeFeed(this.items, this.nextCursor);
  final List<Map<String, dynamic>> items;
  final String? nextCursor;
  static final _cursor = RegExp(r'^[A-Za-z0-9_-]{1,128}$');
  factory NoticeFeed.parse(
    Map<String, dynamic> data,
    DateTime nowUtc, {
    String? cursor,
  }) {
    final value = data['items'];
    final next = data['nextCursor'];
    if (value is! List ||
        value.length > 100 ||
        value.any((v) => v is! Map<String, dynamic>) ||
        (next != null &&
            (next is! String || !_cursor.hasMatch(next) || next == cursor))) {
      throw const FormatException('Lista de avisos inválida.');
    }
    final items = value.cast<Map<String, dynamic>>();
    final seen = <String>{};
    for (final notice in items) {
      final published = notice['publishedAt'] is String
          ? DateTime.tryParse(notice['publishedAt'] as String)
          : null;
      if (notice['id'] is! String ||
          !seen.add(notice['id'] as String) ||
          notice['title'] is! String ||
          notice['body'] is! String ||
          notice['pinned'] is! bool ||
          published == null ||
          published.toUtc().isAfter(
            nowUtc.toUtc().add(const Duration(minutes: 1)),
          ) ||
          !{'school', 'class', 'subject'}.contains(notice['audience']) ||
          (notice['audience'] == 'school'
              ? notice['classSubjectId'] != null
              : notice['classSubjectId'] is! String)) {
        throw const FormatException('Aviso inválido.');
      }
    }
    return NoticeFeed(items, next as String?);
  }

  /// Pinned notices first, then the most recent publication; ties keep the
  /// order the school sent, so the feed never reshuffles between refreshes.
  List<Map<String, dynamic>> ordered() {
    final sorted = [...items];
    sorted.sort((a, b) {
      final pin = (b['pinned'] == true ? 1 : 0) - (a['pinned'] == true ? 1 : 0);
      if (pin != 0) return pin;
      return DateTime.parse(
        b['publishedAt'] as String,
      ).compareTo(DateTime.parse(a['publishedAt'] as String));
    });
    return sorted;
  }

  /// Appends the next page, keeping the first copy of an id already shown.
  NoticeFeed merge(NoticeFeed page) {
    final ids = items.map((n) => n['id']).toSet();
    return NoticeFeed([
      ...items,
      ...page.items.where((n) => !ids.contains(n['id'])),
    ], page.nextCursor);
  }
}
