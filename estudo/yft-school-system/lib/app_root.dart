import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:yft_school_system/core/auth/school_suspension.dart';
import 'package:yft_school_system/core/routing/app_router.dart';
import 'package:yft_school_system/core/schools/known_schools.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/theme/app_theme.dart';
import 'package:yft_school_system/core/theme/appearance_state.dart';

/// Registers [notifySchoolSuspended] and shows a full-screen message when the
/// worker returns `403` + `code: school_suspended`.
class AppRoot extends ConsumerStatefulWidget {
  const AppRoot({super.key});

  @override
  ConsumerState<AppRoot> createState() => _AppRootState();
}

class _AppRootState extends ConsumerState<AppRoot> with WidgetsBindingObserver {
  String? _paletteKey;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    notifySchoolSuspended = () {
      if (mounted) {
        ref.read(schoolSuspendedProvider.notifier).setSuspended(true);
      }
    };
  }

  @override
  void didChangePlatformBrightness() {
    // Só importa no modo Sistema; reconstruir é barato.
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    notifySchoolSuspended = null;
    super.dispose();
  }

  Future<void> _onAcknowledgeSuspension() async {
    await FirebaseAuth.instance.signOut();
    if (!mounted) return;
    ref.read(schoolSuspendedProvider.notifier).setSuspended(false);
    appRouter.go('/login');
  }

  @override
  Widget build(BuildContext context) {
    final suspended = ref.watch(schoolSuspendedProvider);
    final appearance = ref.watch(appearanceProvider);
    // Mantém viva a memória de escolas, que escuta cada nova sessão.
    ref.listen(knownSchoolsProvider, (_, _) {});
    final platformDark =
        WidgetsBinding.instance.platformDispatcher.platformBrightness ==
        Brightness.dark;
    final dark = switch (appearance.themeMode) {
      AppThemeMode.system => platformDark,
      AppThemeMode.light => false,
      AppThemeMode.dark => true,
    };
    // A paleta é estática: aplicar antes de construir o tema e os ecrãs.
    AppColors.apply(accent: appearance.accent.color, dark: dark);
    // Os ecrãs lêem AppColors directamente, não pelo Theme: quando a paleta
    // muda, marcar a árvore inteira para reconstruir, sem perder a rota.
    final paletteKey = '${appearance.accentId}-$dark';
    if (_paletteKey != null && _paletteKey != paletteKey) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        void rebuild(Element el) {
          el.markNeedsBuild();
          el.visitChildren(rebuild);
        }
        (context as Element).visitChildren(rebuild);
      });
    }
    _paletteKey = paletteKey;

    return MaterialApp.router(
      title: 'SIGA Plus',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.build(reduceMotion: appearance.reduceMotion),
      routerConfig: appRouter,
      builder: (context, child) {
        final media = MediaQuery.of(context);
        return Stack(
          fit: StackFit.expand,
          children: [
            if (child != null)
              MediaQuery(
                data: media.copyWith(
                  disableAnimations:
                      media.disableAnimations || appearance.reduceMotion,
                ),
                child: child,
              ),
            if (suspended)
              Material(
                color: Colors.black54,
                child: SafeArea(
                  child: Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 400),
                      child: Card(
                        margin: const EdgeInsets.all(24),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                Icons.pause_circle_outline,
                                size: 56,
                                color: Theme.of(context).colorScheme.error,
                              ),
                              const SizedBox(height: 16),
                              Text(
                                'School access paused',
                                textAlign: TextAlign.center,
                                style: Theme.of(context)
                                    .textTheme
                                    .titleLarge
                                    ?.copyWith(
                                      fontWeight: FontWeight.w600,
                                    ),
                              ),
                              const SizedBox(height: 12),
                              Text(
                                'Your school account has been temporarily suspended by the platform administrator. '
                                'Please contact your school leadership or support. You have been signed out.',
                                textAlign: TextAlign.center,
                                style: Theme.of(context)
                                    .textTheme
                                    .bodyMedium
                                    ?.copyWith(
                                      height: 1.4,
                                      color: Theme.of(context)
                                          .colorScheme
                                          .onSurfaceVariant,
                                    ),
                              ),
                              const SizedBox(height: 24),
                              SizedBox(
                                width: double.infinity,
                                child: FilledButton(
                                  onPressed: _onAcknowledgeSuspension,
                                  child: const Text('Back to sign in'),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}
