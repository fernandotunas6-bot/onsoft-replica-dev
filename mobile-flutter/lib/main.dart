import 'dart:async';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:fluentui_system_icons/fluentui_system_icons.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'academic_page.dart';
import 'config.dart';
import 'design/floating_nav.dart';
import 'design/tokens.dart';
import 'design/widgets.dart' show ActivityScope;
import 'gateway.dart';
import 'identity.dart';
import 'institutional_page.dart';
import 'pages/appearance_page.dart';
import 'pages/login_page.dart';
import 'pages/pending_page.dart';
import 'pages/absences_page.dart';
import 'pages/profile_page.dart';
import 'pages/schools_page.dart';
import 'pages/services_page.dart';
import 'pages/side_menu.dart';
import 'pages/transport_page.dart';
import 'pages/welcome_page.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final config = AppConfig.fromEnvironment(web: kIsWeb, base: Uri.base);
  if (config.problems.isNotEmpty) {
    runApp(
      MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: sigaTheme(Brightness.light, Siga.institutionalBlue),
        home: Scaffold(
          body: Center(
            child: Padding(
              padding: const EdgeInsets.all(Siga.s3),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Brand(),
                  const SizedBox(height: Siga.s2),
                  const Text('A aplicação aguarda configuração institucional.'),
                  const SizedBox(height: Siga.s1),
                  Text(
                    'Em falta no .env: ${config.problems.join(', ')}',
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
    return;
  }
  await Supabase.initialize(
    url: config.supabaseUrl,
    anonKey: config.publishableKey,
  );
  final prefs = await SharedPreferences.getInstance();
  runApp(SigaApp(prefs: prefs, config: config));
}

/// Separadores da barra inferior, pela ordem das rotas do shell.
/// Separadores: ícones Fluent em traço; o activo na versão cheia (como no
/// Teams e no LinkedIn).
/// O terceiro valor é o ícone clássico, quando os ícones modernos estão
/// desligados em Aparência.
const tabs = [
  (
    '/home',
    NavItem(FluentIcons.home_24_regular, FluentIcons.home_24_filled, 'Início'),
    FluentIcons.home_24_filled,
  ),
  (
    '/subjects',
    NavItem(
      FluentIcons.book_open_24_regular,
      FluentIcons.book_open_24_filled,
      'Disciplinas',
    ),
    FluentIcons.book_open_24_filled,
  ),
  (
    '/calendar',
    NavItem(
      FluentIcons.calendar_ltr_24_regular,
      FluentIcons.calendar_ltr_24_filled,
      'Calendário',
    ),
    FluentIcons.calendar_ltr_24_filled,
  ),
  (
    '/messages',
    NavItem(
      FluentIcons.chat_24_regular,
      FluentIcons.chat_24_filled,
      'Mensagens',
    ),
    FluentIcons.chat_24_filled,
  ),
  (
    '/more',
    NavItem(
      FluentIcons.more_horizontal_24_regular,
      FluentIcons.more_horizontal_24_filled,
      'Mais',
    ),
    FluentIcons.more_horizontal_24_filled,
  ),
];

/// Posição de «Mensagens» na barra inferior.
final messagesTab = tabs.indexWhere((t) => t.$1 == '/messages');

/// Consultas institucionais só de leitura (servidor decide o acesso; propinas,
/// notas e documentos são exclusivas do aluno).
const institutionalServices = [
  ('notifications', 'Avisos'),
  ('finance', 'Propinas e recibos'),
  ('results', 'Notas publicadas'),
  ('documents', 'Documentos'),
];

class SigaApp extends StatefulWidget {
  const SigaApp({super.key, required this.prefs, required this.config});
  final SharedPreferences prefs;
  final AppConfig config;
  @override
  State<SigaApp> createState() => _SigaAppState();
}

class _SigaAppState extends State<SigaApp> {
  final auth = Supabase.instance.client.auth;
  late final MobileGateway gateway = MobileGateway(
    widget.config.apiOrigin!,
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
  bool welcome = false;
  bool busy = true;
  bool reduced = false;
  int generation = 0;
  ThemeMode appearance = ThemeMode.system;
  Color accent = Siga.institutionalBlue;
  int? backdrop;
  bool modernIcons = true;

  @override
  void initState() {
    super.initState();
    reduced = widget.prefs.getBool('reduced-motion') ?? false;
    appearance = ThemeMode.values.firstWhere(
      (mode) => mode.name == widget.prefs.getString('appearance'),
      orElse: () => ThemeMode.system,
    );
    backdrop = widget.prefs.getInt('backdrop');
    modernIcons = widget.prefs.getBool('modern-icons') ?? true;
    final savedAccent = widget.prefs.getInt('accent');
    for (final (_, color) in Siga.accents) {
      if (color.toARGB32() == savedAccent) accent = color;
    }
    // Movimento reduzido escolhido na app também dispensa a abertura.
    intro = !reduced;
    // A apresentação aparece uma só vez, depois da abertura.
    welcome = !(widget.prefs.getBool('welcome-seen') ?? false);
    router = GoRouter(
      initialLocation: '/home',
      refreshListenable: refresh,
      redirect: (context, state) {
        if (intro) return state.matchedLocation == '/intro' ? null : '/intro';
        if (welcome) {
          return state.matchedLocation == '/welcome' ? null : '/welcome';
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
          '/welcome',
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
          path: '/welcome',
          builder: (_, _) => WelcomePage(
            onDone: () {
              if (!mounted) return;
              widget.prefs.setBool('welcome-seen', true);
              welcome = false;
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
          builder: (_, _) => LoginPage(
            auth: auth,
            onSync: sync,
            recoveryRedirect: widget.config.authRedirect,
            lastSchool: widget.prefs.getString('last-school-name'),
            onGoogle: widget.config.googleLogin
                ? () => signInWith(OAuthProvider.google)
                : null,
            onMicrosoft: widget.config.microsoftLogin
                ? () => signInWith(OAuthProvider.azure)
                : null,
            onApple: widget.config.appleLogin
                ? () => signInWith(OAuthProvider.apple)
                : null,
          ),
        ),
        GoRoute(
          path: '/mfa',
          builder: (_, _) =>
              LoginPage(auth: auth, onSync: sync, factor: factor),
        ),
        GoRoute(path: '/schools', builder: (_, _) => schools()),
        StatefulShellRoute(
          builder: (context, state, shell) => shellPage(shell),
          navigatorContainerBuilder: (context, shell, children) =>
              FadeThroughStack(index: shell.currentIndex, children: children),
          branches: [
            for (final (path, _, _) in tabs)
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
            '',
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
    for (final (service, title) in institutionalServices)
      GoRoute(
        path: service,
        builder: (_, _) => subPage(
          title,
          InstitutionalPage(
            key: ValueKey('$school:$role:$service'),
            gateway: gateway,
            collection: service,
          ),
        ),
      ),
    GoRoute(
      path: 'transport',
      builder: (_, _) => subPage('Transporte escolar', const TransportPage()),
    ),
    GoRoute(
      path: 'absences',
      builder: (_, _) => subPage(
        'Faltas',
        AbsencesPage(key: ValueKey('$school:$role'), gateway: gateway),
      ),
    ),
    GoRoute(
      path: 'profile',
      builder: (_, _) => subPage(
        'Meu perfil',
        ProfilePage(
          name: '${session?['name'] ?? ''}',
          schoolId: school,
          role: role,
          memberships: SchoolChoice.fromSession(session),
          onNavigate: router.go,
          onSwitchSchool: switchSchool,
          onSignOut: () => auth.signOut(),
        ),
      ),
    ),
    for (final MapEntry(key: path, value: service) in pendingServices.entries)
      GoRoute(
        path: path,
        builder: (_, _) => subPage(service.title, PendingPage(service)),
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
            backdrop: backdrop,
            onBackdrop: (value) {
              backdrop = value;
              if (value == null) {
                widget.prefs.remove('backdrop');
              } else {
                widget.prefs.setInt('backdrop', value);
              }
              update();
            },
            modernIcons: modernIcons,
            onModernIcons: (value) {
              modernIcons = value;
              widget.prefs.setBool('modern-icons', value);
              update();
            },
          ),
        ),
      ),
    ),
  ];

  final refresh = ValueNotifier<int>(0);

  /// Novidades por ler no SIGA: conversas (ponto em «Mensagens») e avisos
  /// (ponto no sino).
  bool unreadChats = false;
  bool unreadNotices = false;

  Future<void> refreshUnread() async {
    await Future.wait([
      () async {
        try {
          final chat = await gateway.read('chat');
          final threads = chat['threads'];
          final any =
              threads is List &&
              threads.any(
                (t) => t is Map && t['unread'] is int && t['unread'] > 0,
              );
          if (mounted && any != unreadChats) {
            setState(() => unreadChats = any);
          }
        } catch (_) {
          // Sem ligação: o ponto fica como estava; a página mostra o erro.
        }
      }(),
      () async {
        try {
          final notices = await gateway.read('notifications');
          final any = notices['unread'] is int && notices['unread'] > 0;
          if (mounted && any != unreadNotices) {
            setState(() => unreadNotices = any);
          }
        } catch (_) {
          // Idem.
        }
      }(),
    ]);
  }

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

  /// Abre o fornecedor (Google, Microsoft ou Apple) no browser; o regresso à
  /// app (SIGA_AUTH_REDIRECT) faz o SDK criar a sessão, e o
  /// onAuthStateChange trata do resto.
  Future<void> signInWith(OAuthProvider provider) async {
    await auth.signInWithOAuth(
      provider,
      redirectTo: widget.config.authRedirect,
    );
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
      widget.prefs.setString('last-school-name', choice.schoolName);
      gateway.select(session!['userId'] as String, school!, role!);
      update();
      unawaited(refreshUnread());
    },
  );

  String get roleLabel => role == 'professor' ? 'Professor' : 'Aluno';

  String get schoolName {
    for (final m in (session?['memberships'] as List? ?? [])) {
      if (m is Map && m['schoolId'] == school) return '${m['schoolName']}';
    }
    return 'SIGA Plus';
  }

  /// Turma do aluno (para «Aluno · 10.ª Classe»); vazio até haver catálogo.
  String get memberSubtitle => [roleLabel, schoolName].join(' · ');

  Widget shellPage(StatefulNavigationShell shell) => ActivityScope(
    unreadNotices: unreadNotices,
    unreadChats: unreadChats,
    refresh: () => unawaited(refreshUnread()),
    child: shellScaffold(shell),
  );

  Widget shellScaffold(StatefulNavigationShell shell) => Scaffold(
    drawer: SideMenu(
      name: '${session?['name'] ?? ''}',
      subtitle: memberSubtitle,
      student: role == 'aluno',
      dark: appearance == ThemeMode.dark,
      onDark: (value) {
        appearance = value ? ThemeMode.dark : ThemeMode.light;
        widget.prefs.setString('appearance', appearance.name);
        update();
      },
      onNavigate: router.go,
      onSwitchSchool: switchSchool,
      onSignOut: () => auth.signOut(),
    ),
    body: SafeArea(
      bottom: false,
      child: Align(
        alignment: Alignment.topCenter,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 720),
          child: shell,
        ),
      ),
    ),
    bottomNavigationBar: FloatingNavBar(
      items: [
        for (final (_, item, classic) in tabs)
          modernIcons ? item : NavItem(classic, classic, item.label),
      ],
      index: shell.currentIndex,
      dots: {if (unreadChats) messagesTab},
      onSelected: (index) {
        // Ao sair de «Mensagens», o que foi lido deixa de contar.
        if (shell.currentIndex == messagesTab && index != messagesTab) {
          unawaited(refreshUnread());
        }
        shell.goBranch(index, initialLocation: index == shell.currentIndex);
      },
    ),
  );

  Widget page(String path) {
    if (path == '/more') {
      return ServicesPage(
        schoolName: schoolName,
        student: role == 'aluno',
        onNavigate: router.go,
        onSwitchSchool: switchSchool,
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
            icon: const Icon(FluentIcons.chevron_left_24_regular),
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
      child: AppearanceScope(
        backdrop: backdrop,
        modernIcons: modernIcons,
        child: child!,
      ),
    ),
  );
}
