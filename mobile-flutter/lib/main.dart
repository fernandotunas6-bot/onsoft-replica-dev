import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'gateway.dart';
import 'identity.dart';
import 'academic_page.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  const url = String.fromEnvironment('SUPABASE_URL');
  const key = String.fromEnvironment('SUPABASE_PUBLISHABLE_KEY');
  if (url.isEmpty || !key.startsWith('sb_publishable_')) {
    runApp(
      const MaterialApp(
        home: Scaffold(
          body: Center(
            child: Text('A aplicação aguarda configuração institucional.'),
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
  bool intro = true;
  bool busy = true;
  bool reduced = false;
  int generation = 0;
  ThemeMode appearance = ThemeMode.system;

  @override
  void initState() {
    super.initState();
    reduced = widget.prefs.getBool('reduced-motion') ?? false;
    appearance = ThemeMode.values.firstWhere(
      (mode) => mode.name == widget.prefs.getString('appearance'),
      orElse: () => ThemeMode.system,
    );
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
        }.contains(state.matchedLocation))
          return '/home';
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
          state.event == AuthChangeEvent.initialSession)
        return;
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
      if (revision == generation)
        error = 'Não foi possível confirmar os seus vínculos. Tente novamente.';
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
        found['memberships'] is! List)
      throw StateError('Sessão institucional inválida.');
    for (final m in found['memberships'] as List) {
      if (m is! Map ||
          m['schoolId'] is! String ||
          m['schoolName'] is! String ||
          m['active'] is! bool ||
          m['roles'] is! List ||
          (m['roles'] as List).any((r) => r != 'aluno' && r != 'professor'))
        throw StateError('Vínculo institucional inválido.');
    }
  }

  Widget schools() => Scaffold(
    appBar: AppBar(
      title: const Text('Seleccione a sua escola'),
      actions: [
        IconButton(
          onPressed: () => auth.signOut(),
          icon: const Icon(Icons.logout_outlined),
        ),
      ],
    ),
    body: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        if (error != null) ...[
          Text(error!),
          TextButton(onPressed: sync, child: const Text('Tentar novamente')),
        ],
        for (final membership in (session?['memberships'] as List? ?? []))
          if (membership is Map && membership['active'] == true)
            for (final selectedRole in (membership['roles'] as List? ?? []))
              if (selectedRole == 'aluno' || selectedRole == 'professor')
                ListTile(
                  leading: const Icon(Icons.school_outlined),
                  title: Text('${membership['schoolName']}'),
                  subtitle: Text('$selectedRole'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () {
                    if (membership['schoolId'] is! String) return;
                    school = membership['schoolId'] as String;
                    role = selectedRole as String;
                    gateway.select(
                      session!['userId'] as String,
                      school!,
                      role!,
                    );
                    update();
                  },
                ),
        if (error == null &&
            (session?['memberships'] as List? ?? [])
                .where((m) => m is Map && m['active'] == true)
                .isEmpty)
          const Text(
            'Sem escola activa por enquanto. Contacte a secretaria para solicitar o vínculo.',
          ),
      ],
    ),
  );
  Widget shellPage(StatefulNavigationShell shell) => Scaffold(
    appBar: AppBar(
      title: Text(schoolName),
      actions: [
        IconButton(
          tooltip: 'Mudar de escola',
          icon: const Icon(Icons.unfold_more),
          onPressed: () {
            gateway.reset();
            school = role = null;
            update();
          },
        ),
      ],
    ),
    body: Align(
      alignment: Alignment.topCenter,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 720),
        child: shell,
      ),
    ),
    bottomNavigationBar: SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(24),
          child: NavigationBar(
            selectedIndex: shell.currentIndex,
            animationDuration: Duration(milliseconds: reduced ? 0 : 220),
            onDestinationSelected: (index) => shell.goBranch(index),
            destinations: const [
              NavigationDestination(
                icon: Icon(Icons.home_outlined),
                selectedIcon: Icon(Icons.home),
                label: 'Início',
              ),
              NavigationDestination(
                icon: Icon(Icons.menu_book_outlined),
                label: 'Disciplinas',
              ),
              NavigationDestination(
                icon: Icon(Icons.calendar_month_outlined),
                label: 'Calendário',
              ),
              NavigationDestination(
                icon: Icon(Icons.chat_bubble_outline),
                label: 'Mensagens',
              ),
              NavigationDestination(
                icon: Icon(Icons.more_horiz),
                label: 'Mais',
              ),
            ],
          ),
        ),
      ),
    ),
  );
  String get schoolName {
    for (final m in (session?['memberships'] as List? ?? [])) {
      if (m is Map && m['schoolId'] == school) return '${m['schoolName']}';
    }
    return 'SIGA Plus';
  }

  Widget page(String path) {
    if (path == '/more')
      return ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const Brand(),
          const SizedBox(height: 24),
          Text('${session?['name'] ?? ''}'),
          Text(role ?? ''),
          const SizedBox(height: 24),
          Text(
            'Serviços escolares',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          ListTile(
            leading: const Icon(Icons.groups_outlined),
            title: const Text('Turmas'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => router.go('/more/classes'),
          ),
          ListTile(
            leading: const Icon(Icons.assignment_outlined),
            title: const Text('Tarefas'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => router.go('/more/tasks'),
          ),
          ListTile(
            leading: const Icon(Icons.palette_outlined),
            title: const Text('Aparência'),
            onTap: () {
              showModalBottomSheet<void>(
                context: router.routerDelegate.navigatorKey.currentContext!,
                showDragHandle: true,
                builder: (context) => SafeArea(
                  child: StatefulBuilder(
                    builder: (context, sheetSetState) => Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        for (final mode in ThemeMode.values)
                          RadioListTile<ThemeMode>(
                            value: mode,
                            groupValue: appearance,
                            title: Text(
                              mode == ThemeMode.system
                                  ? 'Sistema'
                                  : mode == ThemeMode.light
                                  ? 'Claro'
                                  : 'Escuro',
                            ),
                            onChanged: (value) {
                              appearance = value!;
                              widget.prefs.setString(
                                'appearance',
                                appearance.name,
                              );
                              update();
                              sheetSetState(() {});
                            },
                          ),
                        SwitchListTile(
                          title: const Text('Reduzir movimentos'),
                          value: reduced,
                          onChanged: (value) {
                            reduced = value;
                            widget.prefs.setBool('reduced-motion', value);
                            update();
                            sheetSetState(() {});
                          },
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
          ListTile(
            leading: const Icon(Icons.logout_outlined),
            title: const Text('Sair'),
            onTap: () => auth.signOut(),
          ),
        ],
      );
    return DataPage(
      key: ValueKey('$school:$role:$path'),
      gateway: gateway,
      path: path,
      name: '${session?['name'] ?? ''}',
    );
  }

  Widget servicePage(String title, String path, {String? groupId}) => Scaffold(
    appBar: AppBar(
      title: Text(title),
      leading: IconButton(
        tooltip: 'Voltar',
        icon: const Icon(Icons.arrow_back),
        onPressed: () => router.go('/more'),
      ),
    ),
    body: DataPage(
      key: ValueKey('$school:$role:$path:$groupId'),
      gateway: gateway,
      path: path,
      name: session?['name'] as String? ?? '',
      groupId: groupId,
    ),
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
    theme: theme(Brightness.light),
    darkTheme: theme(Brightness.dark),
    routerConfig: router,
    builder: (context, child) => MediaQuery(
      data: MediaQuery.of(context).copyWith(
        disableAnimations: reduced || MediaQuery.disableAnimationsOf(context),
      ),
      child: child!,
    ),
  );
  ThemeData theme(Brightness brightness) => ThemeData(
    useMaterial3: true,
    brightness: brightness,
    colorScheme: ColorScheme.fromSeed(
      seedColor: const Color(0xff315ff6),
      brightness: brightness,
    ),
    scaffoldBackgroundColor: brightness == Brightness.light
        ? Colors.white
        : const Color(0xff151922),
    appBarTheme: const AppBarTheme(surfaceTintColor: Colors.transparent),
    inputDecorationTheme: InputDecorationTheme(
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
    ),
    navigationBarTheme: const NavigationBarThemeData(
      height: 72,
      indicatorColor: Color(0xffdce5ff),
    ),
  );
}

class LoginPage extends StatefulWidget {
  const LoginPage({
    super.key,
    required this.auth,
    required this.onSync,
    this.factor,
  });
  final GoTrueClient auth;
  final Future<void> Function() onSync;
  final String? factor;
  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final email = TextEditingController();
  final password = TextEditingController();
  final code = TextEditingController();
  bool busy = false;
  String? error;
  Future<void> submit() async {
    if (busy) return;
    if (widget.factor == null &&
        (email.text.trim().isEmpty || password.text.isEmpty)) {
      setState(() {
        error = 'Preencha o e-mail e a senha.';
      });
      return;
    }
    if (widget.factor != null &&
        !RegExp(r'^\d{6}$').hasMatch(code.text.trim())) {
      setState(() {
        error = 'Introduza os seis dígitos do código.';
      });
      return;
    }
    final credential = password.text;
    password.clear();
    setState(() {
      busy = true;
      error = null;
    });
    try {
      if (widget.factor != null) {
        await widget.auth.mfa.challengeAndVerify(
          factorId: widget.factor!,
          code: code.text.trim(),
        );
      } else {
        await widget.auth.signInWithPassword(
          email: email.text.trim(),
          password: credential,
        );
      }
      password.clear();
      code.clear();
      await widget.onSync();
    } catch (_) {
      if (mounted)
        setState(() {
          error = 'Verifique os seus dados e tente novamente.';
        });
    } finally {
      if (mounted)
        setState(() {
          busy = false;
        });
    }
  }

  @override
  void dispose() {
    email.dispose();
    password.dispose();
    code.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 400),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Center(child: Brand()),
                const SizedBox(height: 56),
                Text(
                  widget.factor == null
                      ? 'Aceda à sua conta'
                      : 'Confirme a sua identidade',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 16),
                if (widget.factor == 'unsupported')
                  const Text(
                    'Use o portal original para confirmar o seu segundo factor. Este cliente suporta TOTP.',
                  )
                else if (widget.factor != null)
                  TextField(
                    controller: code,
                    keyboardType: TextInputType.number,
                    autofillHints: const [AutofillHints.oneTimeCode],
                    maxLength: 6,
                    decoration: const InputDecoration(
                      labelText: 'Código de autenticação',
                    ),
                  )
                else ...[
                  TextField(
                    controller: email,
                    keyboardType: TextInputType.emailAddress,
                    autofillHints: const [AutofillHints.username],
                    decoration: const InputDecoration(
                      labelText: 'E-mail institucional',
                      prefixIcon: Icon(Icons.mail_outline),
                    ),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: password,
                    obscureText: true,
                    autofillHints: const [AutofillHints.password],
                    decoration: const InputDecoration(
                      labelText: 'Senha',
                      prefixIcon: Icon(Icons.lock_outline),
                    ),
                  ),
                ],
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: busy || widget.factor == 'unsupported'
                      ? null
                      : submit,
                  child: Text(
                    busy
                        ? 'A confirmar…'
                        : widget.factor == null
                        ? 'Entrar'
                        : 'Confirmar código',
                  ),
                ),
                if (widget.factor != null)
                  TextButton(
                    onPressed: () => widget.auth.signOut(),
                    child: const Text('Sair desta conta'),
                  ),
                if (error != null) Text(error!, semanticsLabel: error),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}
