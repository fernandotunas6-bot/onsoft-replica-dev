/// Gera anos lectivos no formato '2025/2026'.
List<String> getAcademicYears({
  int startOffset = -2, // Include 2 past years
  int count = 11, // Total years
}) {
  final now = DateTime.now();
  final currentYear = now.year;
  return List.generate(count, (index) {
    final yearStart = currentYear + startOffset + index;
    return '$yearStart/${yearStart + 1}';
  });
}

/// Ano lectivo em curso.
///
/// Antes devolvia sempre `ano/ano+1`, sem olhar ao mês: em Março de 2026 dizia
/// «2026/2027», um ano lectivo que ainda não tinha começado. A viragem passa a
/// ser em Setembro, a convenção que os próprios dados usam. Se a escola seguir
/// o ano lectivo angolano, que começa em Fevereiro e cabe num só ano civil,
/// esta convenção tem de ser decidida antes de a app ser usada.
String getCurrentAcademicYear({int startMonth = 9}) {
  final now = DateTime.now();
  final firstYear = now.month >= startMonth ? now.year : now.year - 1;
  return '$firstYear/${firstYear + 1}';
}

/// Data máxima dos selectores de data (10 anos a partir de hoje).
DateTime getMaxDatePickerDate() {
  return DateTime.now().add(const Duration(days: 365 * 10));
}

/// Formata a data como '12 Out 2026'.
String formatDemoDate(DateTime date) {
  final months = [
    'Jan',
    'Fev',
    'Mar',
    'Abr',
    'Mai',
    'Jun',
    'Jul',
    'Ago',
    'Set',
    'Out',
    'Nov',
    'Dez',
  ];
  return '${date.day.toString().padLeft(2, '0')} ${months[date.month - 1]} ${date.year}';
}
