import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/theme/app_theme.dart';
import 'package:yft_school_system/core/theme/motion.dart';
import 'package:yft_school_system/core/widgets/section_widgets.dart';

void main() {
  group('CardGroup', () {
    test('cantos largos por fora, estreitos por dentro', () {
      const outer = Radius.circular(22);
      const inner = Radius.circular(6);
      expect(CardGroup.radiusAt(0, 1), const BorderRadius.all(outer));
      expect(
        CardGroup.radiusAt(0, 3),
        const BorderRadius.vertical(top: outer, bottom: inner),
      );
      expect(CardGroup.radiusAt(1, 3), const BorderRadius.all(inner));
      expect(
        CardGroup.radiusAt(2, 3),
        const BorderRadius.vertical(top: inner, bottom: outer),
      );
    });

    testWidgets('o SoftCard dentro do grupo usa os cantos da posição', (
      tester,
    ) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: CardGroup(
              children: [
                SoftCard(child: Text('a')),
                SoftCard(child: Text('b')),
              ],
            ),
          ),
        ),
      );
      final materials = tester
          .widgetList<Material>(
            find.descendant(
              of: find.byType(SoftCard),
              matching: find.byType(Material),
            ),
          )
          .toList();
      expect(materials.first.borderRadius, CardGroup.radiusAt(0, 2));
      expect(materials.last.borderRadius, CardGroup.radiusAt(1, 2));
    });
  });

  test('a mola começa em 0, acaba em 1 e ressalta pouco', () {
    for (final curve in [AppMotion.press, AppMotion.spatial]) {
      expect(curve.transform(0), 0);
      expect(curve.transform(1), 1);
      var peak = 0.0;
      for (var t = 0.0; t <= 1; t += 0.01) {
        peak = curve.transform(t) > peak ? curve.transform(t) : peak;
      }
      expect(peak, lessThan(1.12));
      // Assenta antes do fim: sem salto no último frame.
      expect((curve.transform(0.99) - 1).abs(), lessThan(0.01));
    }
  });

  test('acção das faixas escuras lê bem com todas as cores principais', () {
    for (final dark in [false, true]) {
      for (final a in AppColors.accents) {
        AppColors.apply(accent: a.color, dark: dark);
        expect(
          AppColors.contrast(accentOn(AppColors.ink), AppColors.ink),
          greaterThanOrEqualTo(4.5),
          reason: '${a.id} ${dark ? 'escuro' : 'claro'}',
        );
      }
    }
    AppColors.apply(accent: AppColors.accents.first.color, dark: false);
  });
}
