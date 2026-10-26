import 'package:flutter_test/flutter_test.dart';
import 'package:yft_school_system/core/sga/sga_auth.dart';

void main() {
  test('n.º de aluno: a mesma regra do portal', () {
    expect(normalizeStudentNumber('1260001'), '1260001');
    expect(normalizeStudentNumber('126 0001'), '1260001');
    expect(normalizeStudentNumber('126-00.01'), '1260001');
    // «0000» depois do ano não é número de aluno; nem B.I., nem e-mail.
    expect(normalizeStudentNumber('1260000'), isNull);
    expect(normalizeStudentNumber('004212984LA042'), isNull);
    expect(normalizeStudentNumber('ana@escola.ao'), isNull);
  });

  test('a rota de entrada vai ao subdomínio da escola quando há escola', () {
    expect(
      identifierLoginUrl('https://portal-siga.com', 'ISPAB'),
      'https://ispab.portal-siga.com/api/mobile/login',
    );
    expect(
      identifierLoginUrl('https://www.portal-siga.com', 'escola-um'),
      'https://escola-um.portal-siga.com/api/mobile/login',
    );
    expect(
      identifierLoginUrl('', null),
      'https://portal-siga.com/api/mobile/login',
    );
  });

  test('endereço de escola com caracteres inválidos é recusado antes do pedido', () {
    expect(
      () => identifierLoginUrl('https://portal-siga.com', 'evil.com/x'),
      throwsA(isA<SgaAuthException>()),
    );
  });
}
