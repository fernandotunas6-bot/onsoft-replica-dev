/// Avisos e resultados publicados, lidos do contrato em backend/records.ts.
///
/// Duas regras de domínio mandam aqui, e ambas vêm de
/// docs/AUDITORIA_E_PLANO.md: a escala vem da escola (nada presume 0–20) e uma
/// nota só existe para quem lê depois de publicada. Um envelope que não
/// corresponda ao contrato é FormatException — a página mostra um erro
/// explícito em vez de uma lista vazia, que se confundiria com «não há nada».
library;

class Notice {
  const Notice({
    required this.id,
    required this.title,
    required this.body,
    required this.publishedAt,
    required this.category,
    required this.read,
  });
  final String id;
  final String title;
  final String body;
  final DateTime publishedAt;
  final String? category;
  final bool read;
}

class NoticeFeed {
  const NoticeFeed({required this.items, required this.hasMore});
  final List<Notice> items;

  /// O servidor declarou mais páginas e este cliente ainda não as pede: a
  /// página di-lo, em vez de apresentar um fim que não é o fim.
  final bool hasMore;

  static NoticeFeed parse(Map<String, dynamic> payload) {
    final items = _items(payload);
    final cursor = payload['nextCursor'];
    if (cursor != null && cursor is! String) {
      throw const FormatException('Cursor de avisos inválido.');
    }
    return NoticeFeed(
      items: items.map(_notice).toList()
        ..sort((a, b) => b.publishedAt.compareTo(a.publishedAt)),
      hasMore: cursor is String && cursor.isNotEmpty,
    );
  }

  static Notice _notice(Map<String, dynamic> item) {
    final id = item['id'];
    final title = item['title'];
    final body = item['body'];
    final published = _instant(item['publishedAt']);
    final category = item['category'];
    final read = item['read'];
    if (id is! String ||
        id.isEmpty ||
        title is! String ||
        title.isEmpty ||
        body is! String ||
        published == null ||
        (category != null && category is! String) ||
        (read != null && read is! bool)) {
      throw const FormatException('Aviso fora do contrato institucional.');
    }
    return Notice(
      id: id,
      title: title,
      body: body,
      publishedAt: published,
      category: category as String?,
      read: read == true,
    );
  }
}

class GradeEntry {
  const GradeEntry({
    required this.id,
    required this.classSubjectId,
    required this.subjectName,
    required this.termName,
    required this.kind,
    required this.published,
    required this.value,
    required this.scaleMax,
    required this.publishedAt,
  });
  final String id;
  final String classSubjectId;
  final String subjectName;
  final String termName;
  final String kind;
  final bool published;
  final double? value;
  final double? scaleMax;
  final DateTime? publishedAt;

  /// Nunca inventa escala: sem `scaleMax` não há número para mostrar.
  String get display => published && value != null && scaleMax != null
      ? '${_number(value!)} / ${_number(scaleMax!)}'
      : 'Por publicar';
}

class ResultSheet {
  const ResultSheet({required this.items});
  final List<GradeEntry> items;

  /// Agrupa por período na ordem em que o servidor os devolveu: a ordenação
  /// lectiva é da escola e não se deduz do nome.
  Map<String, List<GradeEntry>> get byTerm {
    final terms = <String, List<GradeEntry>>{};
    for (final item in items) {
      (terms[item.termName] ??= []).add(item);
    }
    return terms;
  }

  static ResultSheet parse(Map<String, dynamic> payload) =>
      ResultSheet(items: _items(payload).map(_entry).toList());

  static GradeEntry _entry(Map<String, dynamic> item) {
    final id = item['id'];
    final classSubjectId = item['classSubjectId'];
    final subjectName = item['subjectName'];
    final termName = item['termName'];
    final kind = item['kind'];
    final status = item['status'];
    if (id is! String ||
        id.isEmpty ||
        classSubjectId is! String ||
        classSubjectId.isEmpty ||
        subjectName is! String ||
        subjectName.isEmpty ||
        termName is! String ||
        termName.isEmpty ||
        kind is! String ||
        kind.isEmpty ||
        (status != 'published' && status != 'pending')) {
      throw const FormatException('Resultado fora do contrato institucional.');
    }
    final published = status == 'published';
    final value = _decimal(item['value']);
    final scaleMax = _decimal(item['scaleMax']);
    final publishedAt = _instant(item['publishedAt']);
    if (published) {
      // Publicada sem valor, sem escala utilizável ou acima do máximo: não se
      // mostra um número que não se sabe ler.
      if (value == null ||
          scaleMax == null ||
          scaleMax <= 0 ||
          value < 0 ||
          value > scaleMax ||
          publishedAt == null) {
        throw const FormatException('Resultado publicado sem escala válida.');
      }
    } else if (item['value'] != null || item['scaleMax'] != null) {
      // Um rascunho que viaje com nota é um erro do servidor, não um dado a
      // apresentar a quem está a ser avaliado.
      throw const FormatException('Resultado por publicar com nota.');
    }
    return GradeEntry(
      id: id,
      classSubjectId: classSubjectId,
      subjectName: subjectName,
      termName: termName,
      kind: kind,
      published: published,
      value: published ? value : null,
      scaleMax: published ? scaleMax : null,
      publishedAt: published ? publishedAt : null,
    );
  }
}

List<Map<String, dynamic>> _items(Map<String, dynamic> payload) {
  if (payload['version'] != 1) {
    throw const FormatException('Versão do contrato não suportada.');
  }
  final items = payload['items'];
  if (items is! List) {
    throw const FormatException('Resposta institucional sem itens.');
  }
  return items.map((item) {
    if (item is! Map<String, dynamic>) {
      throw const FormatException('Item institucional inválido.');
    }
    return item;
  }).toList();
}

DateTime? _instant(Object? value) =>
    value is String ? DateTime.tryParse(value)?.toUtc() : null;

double? _decimal(Object? value) => switch (value) {
  final num number when number.isFinite => number.toDouble(),
  _ => null,
};

String _number(double value) => value == value.roundToDouble()
    ? value.toStringAsFixed(0)
    : value.toStringAsFixed(2);
