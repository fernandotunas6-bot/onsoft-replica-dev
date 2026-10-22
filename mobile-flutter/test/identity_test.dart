import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:siga_plus_flutter/identity.dart';

void main() {
  testWidgets('skip completes once and cancels long animation', (tester) async {
    var completions = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: IdentityIntro(
          onDone: () {
            completions++;
          },
        ),
      ),
    );
    await tester.tap(find.text('Saltar'));
    await tester.pump(const Duration(seconds: 5));
    expect(completions, 1);
  });
  testWidgets('reduced motion completes without a three-second wait', (
    tester,
  ) async {
    var completions = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: MediaQuery(
          data: const MediaQueryData(disableAnimations: true),
          child: IdentityIntro(
            onDone: () {
              completions++;
            },
          ),
        ),
      ),
    );
    await tester.pump();
    expect(completions, 1);
  });
}
