/// Nome a mostrar de um período lectivo.
///
/// A API guarda os períodos como "Term 1", "Term 2"… e compara-os assim; só
/// a apresentação muda. Com dois períodos por ano são semestres, senão
/// trimestres (o normal em Angola).
String termLabel(String? raw, {int termSystem = 3}) {
  final value = raw?.trim() ?? '';
  final m = RegExp(r'^Term\s*(\d)$', caseSensitive: false).firstMatch(value);
  if (m == null) return value;
  return '${m[1]}.º ${termSystem == 2 ? 'semestre' : 'trimestre'}';
}

/// Sexo guardado em inglês ("Male"/"Female"/"Other"), mostrado em português.
String genderLabel(String? raw) => switch (raw?.trim().toLowerCase()) {
  'male' || 'm' => 'Masculino',
  'female' || 'f' => 'Feminino',
  'other' => 'Outro',
  null || '' => '—',
  _ => raw!,
};
