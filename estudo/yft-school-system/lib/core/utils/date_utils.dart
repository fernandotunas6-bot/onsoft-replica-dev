/// Generates academic year strings like '2024/2025' dynamically.
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

/// Gets the current academic year.
String getCurrentAcademicYear() {
  final now = DateTime.now();
  final currentYear = now.year;
  return '$currentYear/${currentYear + 1}';
}

/// Gets a max date for date pickers (10 years from now).
DateTime getMaxDatePickerDate() {
  return DateTime.now().add(const Duration(days: 365 * 10));
}

/// Formats date to 'dd MMM yyyy' e.g., '12 Oct 2026'.
String formatDemoDate(DateTime date) {
  final months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return '${date.day.toString().padLeft(2, '0')} ${months[date.month - 1]} ${date.year}';
}

/// Lê uma data do servidor para a hora local. O D1 grava em UTC no formato
/// "2026-03-15 08:30:00" (sem "T" nem "Z"), que o Dart leria como hora local;
/// datas já com fuso ("…Z", "+01:00") e só com o dia são respeitadas.
DateTime? parseServerTime(String? raw) {
  if (raw == null || raw.trim().isEmpty) return null;
  var s = raw.trim().replaceFirst(' ', 'T');
  final hasTime = s.contains('T');
  final hasZone = RegExp(r'(Z|[+-]\d{2}:?\d{2})$').hasMatch(s);
  if (hasTime && !hasZone) s = '${s}Z';
  return DateTime.tryParse(s)?.toLocal();
}

/// "16/10/2026 07:37" na hora local; "—" sem data; o texto tal como veio se
/// não for uma data.
String formatServerDateTime(String? raw) {
  if (raw == null || raw.trim().isEmpty) return '—';
  final t = parseServerTime(raw);
  if (t == null) return raw;
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(t.day)}/${two(t.month)}/${t.year} ${two(t.hour)}:${two(t.minute)}';
}
