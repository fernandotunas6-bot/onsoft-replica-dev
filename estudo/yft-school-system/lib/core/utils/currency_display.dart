/// Formata valores para o ecrã com a moeda configurada pela escola na API.
String formatMoneyDisplay(String currency, double amount) {
  return '${currency.trim()} ${amount.toStringAsFixed(2)}';
}

/// Valor seguro para PDF: as fontes padrão do PDF não têm símbolos como ₵ ou
/// €. Quando a moeda configurada tem caracteres fora do ASCII, usa-se o código
/// ISO. `Kz` é ASCII, por isso o kwanza passa tal e qual.
String formatMoneyForPdf(String currency, double amount) {
  final c = currency.trim();
  final asciiOnly = RegExp(r'^[\x00-\x7F]+$').hasMatch(c);
  final code = asciiOnly ? c : 'AOA';
  return '$code ${amount.toStringAsFixed(2)}';
}
