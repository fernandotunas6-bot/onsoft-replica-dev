import 'package:flutter_test/flutter_test.dart';
import 'package:yft_school_system/core/utils/date_utils.dart';

void main() {
  test('datas do D1 sem fuso são UTC', () {
    final t = parseServerTime('2026-10-16 06:37:54')!;
    expect(t.isUtc, isFalse);
    expect(t.toUtc(), DateTime.utc(2026, 10, 16, 6, 37, 54));
    expect(parseServerTime('2026-10-16 06:37:54.257')!.toUtc().millisecond, 257);
  });

  test('datas com fuso ou só com o dia ficam como vêm', () {
    expect(parseServerTime('2026-10-16T06:37:54Z')!.toUtc().hour, 6);
    expect(parseServerTime('2026-10-16T07:37:54+01:00')!.toUtc().hour, 6);
    expect(parseServerTime('2026-10-16'), DateTime(2026, 10, 16));
    expect(parseServerTime(''), isNull);
    expect(parseServerTime(null), isNull);
  });

  test('formato para mostrar', () {
    final local = DateTime.utc(2026, 3, 5, 8, 4).toLocal();
    String two(int n) => n.toString().padLeft(2, '0');
    expect(
      formatServerDateTime('2026-03-05 08:04:00'),
      '${two(local.day)}/${two(local.month)}/${local.year} ${two(local.hour)}:${two(local.minute)}',
    );
    expect(formatServerDateTime(''), '—');
    expect(formatServerDateTime('ontem'), 'ontem');
  });
}
