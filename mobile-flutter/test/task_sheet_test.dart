import 'package:flutter_test/flutter_test.dart';
import 'package:siga_plus_flutter/pages/task_sheet.dart';

void main() {
  // Quarta-feira, 14/10/2026, 10:00 em Luanda (09:00 UTC).
  final now = DateTime.utc(2026, 10, 14, 9);

  test('prazos relativos no relógio de Luanda', () {
    expect(dueText('2026-10-14T17:00:00Z', now: now), (
      'Termina hoje às 18:00',
      Urgency.today,
    ));
    expect(dueText('2026-10-15T17:00:00Z', now: now).$2, Urgency.week);
    expect(
      dueText('2026-10-15T17:00:00Z', now: now).$1,
      startsWith('Termina amanhã'),
    );
    expect(dueText('2026-10-16T17:00:00Z', now: now).$1, 'Termina na sexta');
    expect(dueText('2026-10-30T17:00:00Z', now: now).$2, Urgency.later);
    expect(dueText('2026-10-13T17:00:00Z', now: now), (
      'Terminou ontem',
      Urgency.overdue,
    ));
    expect(dueText('2026-10-10T17:00:00Z', now: now).$1, 'Terminou há 4 dias');
    expect(dueText(null, now: now).$2, Urgency.none);
  });

  test('23:30 UTC já é o dia seguinte em Luanda', () {
    // 23:30 UTC de 14/10 = 00:30 de 15/10 em Luanda → amanhã, não hoje.
    expect(
      dueText('2026-10-14T23:30:00Z', now: now).$1,
      startsWith('Termina amanhã'),
    );
  });
}
