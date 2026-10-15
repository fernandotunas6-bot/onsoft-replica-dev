/// Kwanza: «25 000,00 Kz», como no SIGA (milhares com espaço inseparável,
/// vírgula decimal, símbolo no fim). Outras moedas: «GH₵ 25,000.00».
String formatMoneyDisplay(String currency, double amount) =>
    _format(currency.trim(), amount, '\u00a0');

/// PDF-safe amount: standard PDF fonts often break on symbols like GH₵ or ₵
/// and on the non-breaking space. Uses an ASCII-only ISO-style code when the
/// stored currency contains non-ASCII characters.
String formatMoneyForPdf(String currency, double amount) {
  final c = currency.trim();
  final asciiOnly = RegExp(r'^[\x00-\x7F]+$').hasMatch(c);
  return _format(asciiOnly ? c : 'GHS', amount, ' ');
}

bool _isKwanza(String c) => c == 'Kz' || c.toUpperCase() == 'AOA';

String _format(String currency, double amount, String kwanzaGroup) {
  final sign = amount < 0 ? '-' : '';
  final cents = (amount.abs() * 100).round();
  final kwanza = _isKwanza(currency);
  final units = '${cents ~/ 100}'.replaceAllMapped(
    RegExp(r'\B(?=(\d{3})+$)'),
    (_) => kwanza ? kwanzaGroup : ',',
  );
  final fraction = (cents % 100).toString().padLeft(2, '0');
  return kwanza
      ? '$sign$units,$fraction $currency'
      : '$sign$currency $units.$fraction';
}
