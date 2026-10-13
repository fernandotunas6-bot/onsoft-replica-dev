import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'academic_page.dart';
import 'design/floating_nav.dart';
import 'design/tokens.dart';
import 'gateway.dart';
import 'identity.dart';
import 'pages/appearance_page.dart';
import 'pages/login_page.dart';
import 'pages/more_page.dart';
import 'pages/schools_page.dart';
import 'pages/transport_page.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  const url = String.fromEnvironment('SUPABASE_URL');
  const key = String.fromEnvironment('SUPABASE_PUBLISHABLE_KEY');
  if (url.isEmpty || !key.startsWith('sb_publishable_')) {
    runApp(
      MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: sigaTheme(Brightness.light, Siga.institutionalBlue),
        home: const Scaffold(
          body: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Brand(),
                SizedBox(height: Siga.s2),
                Text('A aplicação aguarda configuração institucional.'),
              ],
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

/// Separadores da barra inferior, pela ordem das rotas do shell.
const tabs = [
  ('/home', NavItem(Icons.home_outlined, Icons.home_rounded, 'Início')),
  (
    '/subjects',
    NavItem(Icons.menu_book_outlined, Icons.menu_book, 'Disciplinas'),
  ),
  (
    '/calendar',
    NavItem(Icons.calendar_month_outlined, Icons.calendar_month, 'Calendário'),
  ),
  (
    '/messages',
    NavItem(Icons.chat_bubble_outline, Icons.chat_bubble, 'Mensagens'),
  ),
  ('/more', NavItem(Icons.more_horiz, Icons.more_horiz, 'Mais')),
];

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
  bool intro = true;
  bool busy = true;
  bool reduced = false;
  int generation = 0;
  ThemeMode appearance = ThemeMode.system;
  Color accent = Siga.institutionalBlue;

  @override
  void initState() {
    super.initState();
    reduced = widget.prefs.getBool('reduced-motion') ?? false;
    appearance = ThemeMode.values.firstWhere(
      (mode) => mode.name == widget.prefs.getString('appearance'),
      orElse: () => ThemeMode.system,
    );
    final savedAccent = widget.prefs.getInt('accent');
    for (final (_, color) in Siga.accents) {
      if (color.toARGB32() == savedAccent) accent = color;
    }
    // Movimento reduzido escolhido na app também dispensa a abertura.
    intro = !reduced;
    router = GoRouter(
      initialLocation: '/home',
      refreshListenable: refresh,
      redirect: (context, state) {
        if (intro) return state.matchedLocation == '/intro' ? null : '/intro';
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
          '/loading',
          '/login',
          '/mfa',
          '/schools',
        }.contains(state.matchedLocation)) {
          return '/home';
        }
        return null;
      },
      routes: [
        GoRoute(
          path: '/intro',
          builder: (_, _) => IdentityIntro(
            short: widget.prefs.getBool('intro-seen') ?? false,
            onDone: () {
              if (!mounted) return;
              widget.prefs.setBool('intro-seen', true);
              intro = false;
              update();
            },
          ),
        ),
        GoRoute(
          path: '/loading',
          builder: (_, _) =>
              const Scaffold(body: Center(child: CircularProgressIndicator())),
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
        GoRoute(path: '/schools', builder: (_, _) => schools()),
        StatefulShellRoute.indexedStack(
          builder: (context, state, shell) => shellPage(shell),
          branches: [
            for (final (path, _) in tabs)
              StatefulShellBranch(
                routes: [
                  GoRoute(
                    path: path,
                    builder: (_, _) => page(path),
                    routes: path == '/more' ? moreRoutes() : [],
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
      // Nenhuma chamada ao SDK dentro do callback de autenticação do SDK.
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

  List<RouteBase> moreRoutes() => [
    GoRoute(
      path: 'classes',
      builder: (_, _) => servicePage('Turmas', '/classes', back: '/more'),
      routes: [
        GoRoute(
          path: ':id',
          builder: (_, state) => servicePage(
            'Turma',
            '/class',
            back: '/more/classes',
            groupId: state.pathParameters['id'],
          ),
        ),
      ],
    ),
    GoRoute(
      path: 'tasks',
      builder: (_, _) => servicePage('Tarefas', '/tasks', back: '/more'),
    ),
    GoRoute(
      path: 'transport',
      builder: (_, _) => subPage('Transporte escolar', const TransportPage()),
    ),
    GoRoute(
      path: 'appearance',
      builder: (_, _) => subPage(
        'Aparência',
        ValueListenableBuilder<int>(
          valueListenable: refresh,
          builder: (_, _, _) => AppearancePage(
            mode: appearance,
            accent: accent,
            reduced: reduced,
            onMode: (value) {
              appearance = value;
              widget.prefs.setString('appearance', value.name);
              update();
            },
            onAccent: (value) {
              accent = value;
              widget.prefs.setInt('accent', value.toARGB32());
              update();
            },
            onReduced: (value) {
              reduced = value;
              widget.prefs.setBool('reduced-motion', value);
              update();
            },
          ),
        ),
      ),
    ),
  ];

  final refresh = ValueNotifier<int>(0);
  void update() {
    if (mounted) {
      setState(() {});
      refresh.value++;
    }
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

  void switchSchool() {
    gateway.reset();
    school = role = null;
    update();
  }

  Widget schools() => SchoolsPage(
    choices: SchoolChoice.fromSession(session),
    error: error,
    onRetry: sync,
    onSignOut: () => auth.signOut(),
    onSelect: (choice) {
      school = choice.schoolId;
      role = choice.role;
      gateway.select(session!['userId'] as String, school!, role!);
      update();
    },
  );

  String get roleLabel => role == 'professor' ? 'Professor' : 'Aluno';

  String get schoolName {
    for (final m in (session?['memberships'] as List? ?? [])) {
      if (m is Map && m['schoolId'] == school) return '${m['schoolName']}';
    }
    return 'SIGA Plus';
  }

  Widget shellPage(StatefulNavigationShell shell) => Scaffold(
    extendBody: true,
    appBar: AppBar(
      toolbarHeight: 64,
      titleSpacing: Siga.s2,
      title: Semantics(
        button: true,
        label: 'Escola activa: $schoolName. Mudar de escola',
        excludeSemantics: true,
        child: InkWell(
          onTap: switchSchool,
          borderRadius: BorderRadius.circular(Siga.rLarge),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const SigaMark(size: 34),
                const SizedBox(width: 10),
                Flexible(
                  child: Text(
                    schoolName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                const SizedBox(width: 4),
                const Icon(Icons.unfold_more, size: 18),
              ],
            ),
          ),
        ),
      ),
    ),
    body: Align(
      alignment: Alignment.topCenter,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 720),
        child: shell,
      ),
    ),
    bottomNavigationBar: FloatingNavBar(
      items: [for (final (_, item) in tabs) item],
      index: shell.currentIndex,
      onSelected: (index) =>
          shell.goBranch(index, initialLocation: index == shell.currentIndex),
    ),
  );

  Widget page(String path) {
    if (path == '/more') {
      return MorePage(
        name: '${session?['name'] ?? ''}',
        roleLabel: roleLabel,
        schoolName: schoolName,
        onNavigate: router.go,
        onSwitchSchool: switchSchool,
        onSignOut: () => auth.signOut(),
      );
    }
    return DataPage(
      key: ValueKey('$school:$role:$path'),
      gateway: gateway,
      path: path,
      name: '${session?['name'] ?? ''}',
      schoolName: schoolName,
    );
  }

  /// Página de serviço dentro de «Mais»: título, voltar e o conteúdo; o gesto
  /// de retorno do sistema também funciona, porque a rota é filha de /more.
  Widget subPage(String title, Widget body, {String back = '/more'}) =>
      Scaffold(
        appBar: AppBar(
          title: Text(title),
          leading: IconButton(
            tooltip: 'Voltar',
            icon: const Icon(Icons.arrow_back),
            onPressed: () => router.go(back),
          ),
        ),
        body: Align(
          alignment: Alignment.topCenter,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 720),
            child: body,
          ),
        ),
      );

  Widget servicePage(
    String title,
    String path, {
    required String back,
    String? groupId,
  }) => subPage(
    title,
    DataPage(
      key: ValueKey('$school:$role:$path:$groupId'),
      gateway: gateway,
      path: path,
      name: session?['name'] as String? ?? '',
      groupId: groupId,
      schoolName: schoolName,
    ),
    back: back,
  );

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
    themeMode: appearance,
    theme: sigaTheme(Brightness.light, accent),
    darkTheme: sigaTheme(Brightness.dark, accent),
    routerConfig: router,
    builder: (context, child) => MediaQuery(
      data: MediaQuery.of(context).copyWith(
        disableAnimations: reduced || MediaQuery.disableAnimationsOf(context),
      ),
      child: child!,
    ),
  );
}
