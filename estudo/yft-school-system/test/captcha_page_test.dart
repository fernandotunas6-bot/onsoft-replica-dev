import 'package:flutter_test/flutter_test.dart';
import 'package:yft_school_system/core/sga/captcha_box_mobile.dart';

void main() {
  test('página do captcha: chave escapada, render explícito e canal de volta', () {
    final html = captchaPage('10000000-ffff-ffff-ffff-000000000001');
    expect(html, contains("sitekey:\"10000000-ffff-ffff-ffff-000000000001\""));
    expect(html, contains('render=explicit'));
    expect(html, contains('Captcha.postMessage'));
    // Uma chave com aspas não fecha a string do JavaScript.
    final hostile = captchaPage('a"b</script>');
    expect(hostile, contains(r'sitekey:"a\"b\u003c/script>"'));
    expect(hostile.split('</script>').length, 3); // só as duas etiquetas reais
  });
}
