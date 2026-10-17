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
