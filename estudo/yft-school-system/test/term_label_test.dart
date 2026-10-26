import 'package:flutter_test/flutter_test.dart';
import 'package:yft_school_system/core/utils/term_label.dart';

void main() {
  test('períodos da API aparecem em português', () {
    expect(termLabel('Term 1'), '1.º trimestre');
    expect(termLabel(' term 3 '), '3.º trimestre');
    expect(termLabel('Term 2', termSystem: 2), '2.º semestre');
    // Nomes que a escola escreveu à mão ficam como estão.
    expect(termLabel('I Trimestre'), 'I Trimestre');
    expect(termLabel(null), '');
  });

  test('sexo guardado em inglês aparece em português', () {
    expect(genderLabel('Male'), 'Masculino');
    expect(genderLabel('female'), 'Feminino');
    expect(genderLabel('Other'), 'Outro');
    expect(genderLabel(null), '—');
    expect(genderLabel('Masculino'), 'Masculino');
  });
}
