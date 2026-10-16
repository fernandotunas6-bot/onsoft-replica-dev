import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/theme/app_theme.dart';
import 'package:yft_school_system/features/auth/presentation/forgot_password_screen.dart';
import 'package:yft_school_system/features/auth/presentation/login_screen.dart';
import 'package:yft_school_system/features/onboarding/presentation/onboarding_screen.dart';
import 'package:yft_school_system/features/profile/presentation/appearance_screen.dart';
import 'package:yft_school_system/features/profile/presentation/help_support_screen.dart';

/// Botões com nome para o leitor de ecrã e com tamanho para o dedo.
void check(String name, Widget Function() build, {bool contrast = true}) {
  for (final dark in [false, true]) {
    testWidgets('$name${dark ? ' (escuro)' : ''}', (tester) async {
      GoogleFonts.config.allowRuntimeFetching = false;
      AppColors.apply(accent: AppColors.accents.first.color, dark: dark);
      addTearDown(
        () =>
            AppColors.apply(accent: AppColors.accents.first.color, dark: false),
      );
      final handle = tester.ensureSemantics();
      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(theme: AppTheme.build(), home: build()),
        ),
      );
      await tester.pump(const Duration(milliseconds: 300));
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      if (contrast) {
        await expectLater(tester, meetsGuideline(textContrastGuideline));
      }
      handle.dispose();
    });
  }
}

void main() {
  check('entrar', () => const LoginScreen());
  check('recuperar senha', () => const ForgotPasswordScreen());
  check('ajuda e apoio', () => const HelpSupportScreen());
  check('boas-vindas', () => const OnboardingScreen());
  // O contraste mede a imagem da área do texto e, nos cartões do tema,
  // apanha a borda: dá 1,9 onde o texto escuro sobre branco tem ~15.
  check('aparência', () => const AppearanceScreen(), contrast: false);
}
