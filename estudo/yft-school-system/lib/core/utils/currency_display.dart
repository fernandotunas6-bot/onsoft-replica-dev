/// Formats money for on-screen display using the school's currency string from the API.
/// Kwanza (AOA/Kz) à angolana: "19 000,00 Kz".
String formatMoneyDisplay(String currency, double amount) {
  final c = currency.trim();
  if (_isKwanza(c)) return '${_ptNumber(amount)} Kz';
  return '$c ${amount.toStringAsFixed(2)}';
}

bool _isKwanza(String c) => c.toUpperCase() == 'AOA' || c.toLowerCase() == 'kz';

/// 19000 → "19 000,00" (espaço nos milhares, vírgula nas casas decimais).
String _ptNumber(double amount) {
  final negative = amount < 0;
  final fixed = amount.abs().toStringAsFixed(2);
  final whole = fixed.substring(0, fixed.length - 3);
  final cents = fixed.substring(fixed.length - 2);
  final groups = <String>[];
  for (var end = whole.length; end > 0; end -= 3) {
    groups.insert(0, whole.substring(end - 3 < 0 ? 0 : end - 3, end));
  }
  return '${negative ? '-' : ''}${groups.join(' ')},$cents';
}

/// PDF-safe amount: standard PDF fonts often break on symbols like GH₵ or ₵.
/// Uses ASCII-only ISO-style code when the stored currency contains non-ASCII characters.
String formatMoneyForPdf(String currency, double amount) {
  final c = currency.trim();
  if (_isKwanza(c)) return '${_ptNumber(amount)} Kz';
  final asciiOnly = RegExp(r'^[\x00-\x7F]+$').hasMatch(c);
  final code = asciiOnly ? c : 'GHS';
  return '$code ${amount.toStringAsFixed(2)}';
}
