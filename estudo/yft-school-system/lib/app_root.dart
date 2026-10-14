import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:yft_school_system/core/auth/school_suspension.dart';
import 'package:yft_school_system/core/routing/app_router.dart';
import 'package:yft_school_system/core/theme/app_theme.dart';

/// Registers [notifySchoolSuspended] and shows a full-screen message when the
/// worker returns `403` + `code: school_suspended`.
class AppRoot extends ConsumerStatefulWidget {
  const AppRoot({super.key});

  @override
  ConsumerState<AppRoot> createState() => _AppRootState();
}

class _AppRootState extends ConsumerState<AppRoot> {
  @override
  void initState() {
    super.initState();
    notifySchoolSuspended = () {
      if (mounted) {
        ref.read(schoolSuspendedProvider.notifier).setSuspended(true);
      }
    };
  }

  @override
  void dispose() {
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

    return MaterialApp.router(
      title: 'Edu Manager',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      routerConfig: appRouter,
      builder: (context, child) {
        return Stack(
          fit: StackFit.expand,
          children: [
            ?child,
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
                                      fontWeight: FontWeight.bold,
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
