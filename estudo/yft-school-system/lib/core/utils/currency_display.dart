/// Formats money for on-screen display using the school's currency string from the API.
String formatMoneyDisplay(String currency, double amount) {
  return '${currency.trim()} ${amount.toStringAsFixed(2)}';
}

/// PDF-safe amount: standard PDF fonts often break on symbols like GH₵ or ₵.
/// Uses ASCII-only ISO-style code when the stored currency contains non-ASCII characters.
String formatMoneyForPdf(String currency, double amount) {
  final c = currency.trim();
  final asciiOnly = RegExp(r'^[\x00-\x7F]+$').hasMatch(c);
  final code = asciiOnly ? c : 'GHS';
  return '$code ${amount.toStringAsFixed(2)}';
}
