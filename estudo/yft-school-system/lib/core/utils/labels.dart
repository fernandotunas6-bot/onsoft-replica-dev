// Etiquetas em português para valores que a API guarda em inglês. Os valores
// enviados e comparados continuam os mesmos («Term 1», «Male»…); só muda o
// que se mostra no ecrã.

/// «Term 1» → «1.º Trimestre» (ou «1.º Semestre» num ano de dois períodos).
String termLabel(String? term, {bool twoTerms = false}) {
  final t = term?.trim() ?? '';
  final m = RegExp(r'^Term\s*(\d)$').firstMatch(t);
  if (m == null) return t.isEmpty ? '—' : t;
  return '${m.group(1)}.º ${twoTerms ? 'Semestre' : 'Trimestre'}';
}

/// «Male» → «Masculino». Valores desconhecidos aparecem como vieram.
String genderLabel(String? gender) {
  switch (gender?.trim().toLowerCase()) {
    case 'male':
      return 'Masculino';
    case 'female':
      return 'Feminino';
    case 'other':
      return 'Outro';
    default:
      return (gender == null || gender.trim().isEmpty) ? '—' : gender.trim();
  }
}
