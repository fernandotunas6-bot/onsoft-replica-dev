import 'package:flutter_test/flutter_test.dart';
import 'package:yft_school_system/core/utils/currency_display.dart';

void main() {
  test('kwanza à angolana', () {
    expect(formatMoneyDisplay('AOA', 19000), '19 000,00 Kz');
    expect(formatMoneyDisplay('Kz', 1234567.5), '1 234 567,50 Kz');
    expect(formatMoneyDisplay('AOA', 999), '999,00 Kz');
    expect(formatMoneyDisplay('AOA', -4000), '-4 000,00 Kz');
    expect(formatMoneyForPdf('AOA', 19000), '19 000,00 Kz');
  });

  test('outras moedas como antes', () {
    expect(formatMoneyDisplay('GHS', 12.5), 'GHS 12.50');
  });
}
