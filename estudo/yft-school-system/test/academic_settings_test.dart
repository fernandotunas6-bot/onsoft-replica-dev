import 'package:flutter_test/flutter_test.dart';
import 'package:yft_school_system/core/settings/academic_year_state.dart';
import 'package:yft_school_system/core/utils/currency_display.dart';
import 'package:yft_school_system/core/utils/date_utils.dart';

void main() {
  test('a escola arranca em kwanza e no I Trimestre', () {
    final defaults = AcademicYearSettings.defaults;
    expect(defaults.currency, 'Kz');
    expect(defaults.activeTerm, 'I Trimestre');
  });

  test('o kwanza atravessa o PDF sem virar código ISO', () {
    expect(formatMoneyDisplay('Kz', 1500), 'Kz 1500.00');
    // Kz é ASCII: as fontes do PDF suportam-no tal e qual.
    expect(formatMoneyForPdf('Kz', 1500), 'Kz 1500.00');
    // Um símbolo fora do ASCII quebraria a fonte, por isso vai o código.
    expect(formatMoneyForPdf('₵', 1500), 'AOA 1500.00');
  });

  test('o ano lectivo só vira em Setembro', () {
    // Antes da correcção, Março devolvia 2026/2027: um ano lectivo que ainda
    // não tinha começado.
    expect(getCurrentAcademicYear(now: DateTime(2026, 3, 15)), '2025/2026');
    expect(getCurrentAcademicYear(now: DateTime(2026, 8, 31)), '2025/2026');
    expect(getCurrentAcademicYear(now: DateTime(2026, 9, 1)), '2026/2027');
    expect(getCurrentAcademicYear(now: DateTime(2026, 12, 31)), '2026/2027');
  });

  test('os meses abreviados estão em português', () {
    expect(formatDemoDate(DateTime(2026, 10, 18)), '18 Out 2026');
    expect(formatDemoDate(DateTime(2026, 2, 3)), '03 Fev 2026');
  });
}
