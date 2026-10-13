import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'academic_page.dart';
import 'access_page.dart';
import 'design.dart';
import 'gateway.dart';
import 'identity.dart';
import 'services_page.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  const url = String.fromEnvironment('SUPABASE_URL');
  const key = String.fromEnvironment('SUPABASE_PUBLISHABLE_KEY');
  if (url.isEmpty || !key.startsWith('sb_publishable_')) {
    runApp(
      MaterialApp(
        theme: sigaTheme(Brightness.light),
        home: const Scaffold(
          body: Center(
            child: Padding(
              padding: EdgeInsets.all(Sg.gutter),
              child: Text('A aplicação aguarda configuração institucional.'),
            ),
          ),
        ),
      ),
    );
    return;
  }
  await Supabase.initialize(url: url, anonKey: key);
  final prefs = await SharedPreferences.getInstance();
  runApp(SigaApp(prefs: prefs));
}

class SigaApp extends StatefulWidget {
  const SigaApp({super.key, required this.prefs});
  final SharedPreferences prefs;
  @override
  State<SigaApp> createState() => _SigaAppState();
}

class _SigaAppState extends State<SigaApp> {
  final auth = Supabase.instance.client.auth;
  late final MobileGateway gateway = MobileGateway(
    Uri.base,
    () async => auth.currentSession?.accessToken,
  );
  late final GoRouter router;
  StreamSubscription<AuthState>? subscription;
  Map<String, dynamic>? session;
  String? school;
  String? role;
  String? factor;
  String? error;
  SchoolService? preview;
  bool intro = true;
  bool presented = false;
  bool busy = true;
  int generation = 0;
  late Appearance appearance;

  @override
  void initState() {
    super.initState();
    final prefs = widget.prefs;
    presented = prefs.getBool('intro-seen') ?? false;
    appearance = Appearance(
      mode: ThemeMode.values.firstWhere(
        (mode) => mode.name == prefs.getString('appearance'),
        orElse: () => ThemeMode.system,
      ),
      accent: prefs.getInt('accent') ?? 0,
      wallpaper: prefs.getInt('wallpaper') ?? 0,
      reducedMotion: prefs.getBool('reduced-motion') ?? false,
      modernIcons: prefs.getBool('modern-icons') ?? true,
    );
    router = GoRouter(
      initialLocation: '/home',
      refreshListenable: refresh,
      redirect: (context, state) {
        if (intro) return state.matchedLocation == '/intro' ? null : '/intro';
        if (!presented) {
          return state.matchedLocation == '/apresentacao'
              ? null
              : '/apresentacao';
        }
        final gate = busy
            ? '/loading'
            : auth.currentSession == null
            ? '/login'
            : factor != null
            ? '/mfa'
            : school == null
            ? '/schools'
            : null;
        if (gate != null) return state.matchedLocation == gate ? null : gate;
        if ({
          '/intro',
          '/apresentacao',
          '/loading',
          '/login',
          '/mfa',
          '/schools',
        }.contains(state.matchedLocation)) {
          return '/home';
        }
        if (state.matchedLocation == '/more/servico' && preview == null) {
          return '/more';
        }
        if (state.matchedLocation == '/more/results' && role != 'aluno') {
          return '/more';
        }
        return null;
      },
      routes: [
        GoRoute(
          path: '/intro',
          builder: (_, _) => IdentityIntro(
            short: presented,
            onDone: () {
              if (!mounted) return;
              intro = false;
              update();
            },
          ),
        ),
        GoRoute(
          path: '/apresentacao',
          builder: (_, _) => PresentationPage(
            onDone: () {
              if (!mounted) return;
              widget.prefs.setBool('intro-seen', true);
              presented = true;
              update();
            },
          ),
        ),
        GoRoute(
          path: '/loading',
          builder: (_, _) => const Scaffold(
            body: Center(child: CircularProgressIndicator(strokeWidth: 2.5)),
          ),
        ),
        GoRoute(
          path: '/login',
          builder: (_, _) => LoginPage(auth: auth, onSync: sync),
        ),
        GoRoute(
          path: '/mfa',
          builder: (_, _) =>
              LoginPage(auth: auth, onSync: sync, factor: factor),
        ),
        GoRoute(
          path: '/schools',
          builder: (_, _) => SchoolsPage(
            memberships: memberships,
            error: error,
            onRetry: sync,
            onSignOut: () => auth.signOut(),
            onSelected: (schoolId, selectedRole) {
              school = schoolId;
              role = selectedRole;
              gateway.select(
                session!['userId'] as String,
                schoolId,
                selectedRole,
              );
              update();
            },
          ),
        ),
        StatefulShellRoute.indexedStack(
          builder: (context, state, shell) => shellPage(shell),
          branches: [
            for (final path in [
              '/home',
              '/subjects',
              '/calendar',
              '/messages',
              '/more',
            ])
              StatefulShellBranch(
                routes: [
                  GoRoute(
                    path: path,
                    builder: (_, _) => page(path),
                    routes: path == '/more'
                        ? [
                            GoRoute(
                              path: 'classes',
                              builder: (_, _) =>
                                  servicePage('Turmas', '/classes'),
                            ),
                            GoRoute(
                              path: 'tasks',
                              builder: (_, _) =>
                                  servicePage('Tarefas', '/tasks'),
                            ),
                            GoRoute(
                              path: 'classes/:id',
                              builder: (_, state) => servicePage(
                                'Turma',
                                '/class',
                                groupId: state.pathParameters['id'],
                              ),
                            ),
                            GoRoute(
                              path: 'notices',
                              builder: (_, _) =>
                                  servicePage('Avisos', '/notices'),
                            ),
                            // Only the pupil profile has a results contract.
                            GoRoute(
                              path: 'results',
                              builder: (_, _) =>
                                  servicePage('Notas', '/results'),
                            ),
                            GoRoute(
                              path: 'transporte',
                              builder: (_, _) => TransportPage(
                                onBack: () => router.go('/more'),
                              ),
                            ),
                            GoRoute(
                              path: 'aparencia',
                              builder: (_, _) => AppearancePage(
                                value: appearance,
                                onBack: () => router.go('/more'),
                                onChanged: saveAppearance,
                              ),
                            ),
                            GoRoute(
                              path: 'servico',
                              builder: (_, _) => ServicePreviewPage(
                                service: preview ?? schoolServices.last,
                                modernIcons: appearance.modernIcons,
                                onBack: () => router.go('/more'),
                              ),
                            ),
                          ]
                        : [],
                  ),
                ],
              ),
          ],
        ),
      ],
    );
    subscription = auth.onAuthStateChange.listen((state) {
      if (state.event == AuthChangeEvent.tokenRefreshed ||
          state.event == AuthChangeEvent.initialSession) {
        return;
      }
      // No SDK calls inside the SDK auth callback.
      gateway.reset();
      session = null;
      school = role = factor = null;
      generation++;
      busy = true;
      update();
      scheduleMicrotask(sync);
    });
    unawaited(sync());
  }

  final refresh = ValueNotifier<int>(0);
  void update() {
    if (mounted) {
      setState(() {});
      refresh.value++;
    }
  }

  void saveAppearance(Appearance value) {
    appearance = value;
    widget.prefs
      ..setString('appearance', value.mode.name)
      ..setInt('accent', value.accent)
      ..setInt('wallpaper', value.wallpaper)
      ..setBool('reduced-motion', value.reducedMotion)
      ..setBool('modern-icons', value.modernIcons);
    update();
  }

  Future<void> sync() async {
    final revision = ++generation;
    gateway.reset();
    session = null;
    school = role = null;
    busy = true;
    error = null;
    update();
    try {
      if (auth.currentSession == null) {
        session = null;
        school = role = factor = null;
      } else {
        final aal = auth.mfa.getAuthenticatorAssuranceLevel();
        if (aal.currentLevel != AuthenticatorAssuranceLevels.aal2 &&
            aal.nextLevel == AuthenticatorAssuranceLevels.aal2) {
          final factors = await auth.mfa.listFactors();
          if (revision != generation || !mounted) return;
          factor = factors.totp.isEmpty ? 'unsupported' : factors.totp.first.id;
        } else {
          final found = await gateway.session();
          if (revision != generation || !mounted) return;
          validateSession(found);
          session = found;
          factor = null;
        }
      }
    } catch (_) {
      if (revision == generation) {
        error = 'Não foi possível confirmar os seus vínculos. Tente novamente.';
      }
    } finally {
      if (revision == generation && mounted) {
        busy = false;
        update();
      }
    }
  }

  void validateSession(Map<String, dynamic> found) {
    if (found['userId'] is! String ||
        found['name'] is! String ||
        found['memberships'] is! List) {
      throw StateError('Sessão institucional inválida.');
    }
    for (final m in found['memberships'] as List) {
      if (m is! Map ||
          m['schoolId'] is! String ||
          m['schoolName'] is! String ||
          m['active'] is! bool ||
          m['roles'] is! List ||
          (m['roles'] as List).any((r) => r != 'aluno' && r != 'professor')) {
        throw StateError('Vínculo institucional inválido.');
      }
    }
  }

  List<Map<String, dynamic>> get memberships => [
    for (final m in (session?['memberships'] as List? ?? []))
      if (m is Map<String, dynamic>) m,
  ];

  String get schoolName {
    for (final m in memberships) {
      if (m['schoolId'] == school) return '${m['schoolName']}';
    }
    return 'SIGA Plus';
  }

  String get personName => session?['name'] as String? ?? '';

  Widget shellPage(StatefulNavigationShell shell) => Wallpaper(
    index: appearance.wallpaper,
    child: Scaffold(
      backgroundColor: Colors.transparent,
      body: SafeArea(
        bottom: false,
        child: Align(
          alignment: Alignment.topCenter,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 560),
            child: shell,
          ),
        ),
      ),
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: Sg.of(context).canvas,
          border: Border(top: BorderSide(color: Sg.of(context).border)),
        ),
        child: SafeArea(
          top: false,
          child: NavigationBar(
            selectedIndex: shell.currentIndex,
            animationDuration: Duration(
              milliseconds: appearance.reducedMotion ? 0 : 220,
            ),
            onDestinationSelected: shell.goBranch,
            destinations: [
              destination(Icons.home_outlined, Icons.home_rounded, 'Início'),
              destination(
                Icons.menu_book_outlined,
                Icons.menu_book_rounded,
                'Disciplinas',
              ),
              destination(
                Icons.calendar_month_outlined,
                Icons.calendar_month_rounded,
                'Calendário',
              ),
              destination(
                Icons.chat_bubble_outline,
                Icons.chat_bubble_rounded,
                'Mensagens',
              ),
              destination(Icons.more_horiz, Icons.more_horiz_rounded, 'Mais'),
            ],
          ),
        ),
      ),
    ),
  );

  NavigationDestination destination(
    IconData icon,
    IconData selected,
    String label,
  ) => NavigationDestination(
    icon: Icon(icon),
    selectedIcon: Icon(selected),
    label: label,
    tooltip: label,
  );

  Widget page(String path) {
    if (path == '/more') {
      return ServicesPage(
        name: personName,
        role: role ?? 'aluno',
        schoolName: schoolName,
        modernIcons: appearance.modernIcons,
        onOpen: open,
        onPreview: openPreview,
        onAccount: accountSheet,
      );
    }
    return dataPage(path);
  }

  Widget dataPage(String path, {String? groupId}) => DataPage(
    key: ValueKey('$school:$role:$path:$groupId'),
    gateway: gateway,
    path: path,
    name: personName,
    groupId: groupId,
    modernIcons: appearance.modernIcons,
    onOpen: open,
    onPreview: openPreview,
  );

  void open(String route) {
    final tabs = {'/home', '/subjects', '/calendar', '/messages', '/more'};
    tabs.contains(route) ? router.go(route) : router.push(route);
  }

  void openPreview(SchoolService service) {
    preview = service;
    update();
    router.push('/more/servico');
  }

  Widget servicePage(String title, String path, {String? groupId}) => Scaffold(
    appBar: AppBar(
      title: Text(title),
      leading: IconButton(
        tooltip: 'Voltar',
        icon: const Icon(Icons.arrow_back),
        onPressed: () => router.canPop() ? router.pop() : router.go('/more'),
      ),
    ),
    body: SafeArea(
      child: Align(
        alignment: Alignment.topCenter,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 560),
          child: dataPage(path, groupId: groupId),
        ),
      ),
    ),
  );

  void accountSheet() {
    final dark =
        appearance.mode == ThemeMode.dark ||
        (appearance.mode == ThemeMode.system &&
            MediaQuery.platformBrightnessOf(
                  router.routerDelegate.navigatorKey.currentContext!,
                ) ==
                Brightness.dark);
    showModalBottomSheet<void>(
      context: router.routerDelegate.navigatorKey.currentContext!,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (context) => AccountSheet(
        name: personName,
        role: role ?? 'aluno',
        className: schoolName,
        dark: dark,
        onDark: (on) => saveAppearance(
          appearance.copyWith(mode: on ? ThemeMode.dark : ThemeMode.light),
        ),
        onOpen: open,
        onPreview: openPreview,
        onAppearance: () => router.push('/more/aparencia'),
        onSwitchSchool: () {
          gateway.reset();
          school = role = null;
          update();
        },
        onSignOut: () => auth.signOut(),
      ),
    );
  }

  @override
  void dispose() {
    generation++;
    subscription?.cancel();
    gateway.dispose();
    router.dispose();
    refresh.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => MaterialApp.router(
    title: 'SIGA Plus',
    debugShowCheckedModeBanner: false,
    themeMode: appearance.mode,
    theme: sigaTheme(Brightness.light, seed: appearance.seed),
    darkTheme: sigaTheme(Brightness.dark, seed: appearance.seed),
    routerConfig: router,
    builder: (context, child) => MediaQuery(
      data: MediaQuery.of(context).copyWith(
        disableAnimations:
            appearance.reducedMotion || MediaQuery.disableAnimationsOf(context),
      ),
      child: child!,
    ),
  );
}
