import 'package:flutter_test/flutter_test.dart';
import 'package:yft_school_system/core/utils/currency_display.dart';

void main() {
  test('kwanza no formato angolano, igual ao SIGA', () {
    expect(formatMoneyDisplay('Kz', 25000), '25\u00a0000,00 Kz');
    expect(formatMoneyDisplay('Kz', 1234567.5), '1\u00a0234\u00a0567,50 Kz');
    expect(formatMoneyDisplay('AOA', 999.99), '999,99 AOA');
    expect(formatMoneyDisplay(' Kz ', 0), '0,00 Kz');
  });

  test('valores negativos e arredondamento ao cêntimo', () {
    expect(formatMoneyDisplay('Kz', -12500), '-12\u00a0500,00 Kz');
    expect(formatMoneyDisplay('Kz', 0.005), '0,01 Kz');
    expect(formatMoneyDisplay('Kz', 10.125), '10,13 Kz');
  });

  test('outras moedas mantêm o formato delas, com milhares', () {
    expect(formatMoneyDisplay('GH₵', 25000), 'GH₵ 25,000.00');
    expect(formatMoneyDisplay('\$', 1234.5), '\$ 1,234.50');
  });

  test('PDF: só ASCII, sem espaço inseparável', () {
    expect(formatMoneyForPdf('Kz', 25000), '25 000,00 Kz');
    expect(formatMoneyForPdf('GH₵', 25000), 'GHS 25,000.00');
  });
}
