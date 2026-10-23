import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'gateway.dart';
import 'identity.dart';
import 'design.dart';
import 'academic_page.dart';
import 'auth_errors.dart';
import 'captcha.dart';
import 'captcha_factory.dart';
import 'identity_login.dart';
import 'records_page.dart';
import 'chat_page.dart';
import 'config.dart';

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
          builder: (_, _) => Scaffold(
            body: Center(
              child: Semantics(
                label: 'A carregar a sua sessão',
                child: const Brand(),
              ),
            ),
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
                    routes: path == '/messages'
                        ? [
                            GoRoute(
                              path: 'thread/:id',
                              builder: (_, state) =>
                                  threadPage(state.pathParameters['id'] ?? ''),
                            ),
                          ]
                        : path == '/more'
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
                              path: 'notices',
                              builder: (_, _) =>
                                  recordsPage('Avisos', 'notices'),
                            ),
                            GoRoute(
                              path: 'results',
                              builder: (_, _) =>
                                  recordsPage('Notas', 'results'),
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
      title: Text(schoolName, maxLines: 1, overflow: TextOverflow.ellipsis),
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
        child: Container(
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(24),
            border: Border.all(
              color: Theme.of(context).colorScheme.outlineVariant,
            ),
          ),
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
    if (path == '/more') {
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
          if (institutionalRecordsEnabled) ...[
            ListTile(
              leading: const Icon(Icons.campaign_outlined),
              title: const Text('Avisos'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => router.go('/more/notices'),
            ),
            ListTile(
              leading: const Icon(Icons.grade_outlined),
              title: const Text('Notas'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => router.go('/more/results'),
            ),
          ],
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
                        RadioGroup<ThemeMode>(
                          groupValue: appearance,
                          onChanged: (value) {
                            if (value == null) return;
                            appearance = value;
                            widget.prefs.setString(
                              'appearance',
                              appearance.name,
                            );
                            update();
                            sheetSetState(() {});
                          },
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              for (final mode in ThemeMode.values)
                                RadioListTile<ThemeMode>(
                                  value: mode,
                                  title: Text(
                                    mode == ThemeMode.system
                                        ? 'Sistema'
                                        : mode == ThemeMode.light
                                        ? 'Claro'
                                        : 'Escuro',
                                  ),
                                ),
                            ],
                          ),
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
    }
    return DataPage(
      key: ValueKey('$school:$role:$path'),
      gateway: gateway,
      path: path,
      name: '${session?['name'] ?? ''}',
    );
  }

  Widget threadPage(String threadId) => Scaffold(
    appBar: AppBar(
      title: const Text('Conversa'),
      leading: IconButton(
        tooltip: 'Voltar',
        icon: const Icon(Icons.arrow_back),
        onPressed: () => router.go('/messages'),
      ),
    ),
    body: ChatHistoryPage(
      key: ValueKey('$school:$role:$threadId'),
      gateway: gateway,
      threadId: threadId,
    ),
  );

  Widget recordsPage(String title, String collection) => Scaffold(
    appBar: AppBar(
      title: Text(title),
      leading: IconButton(
        tooltip: 'Voltar',
        icon: const Icon(Icons.arrow_back),
        onPressed: () => router.go('/more'),
      ),
    ),
    body: RecordsPage(
      key: ValueKey('$school:$role:$collection'),
      gateway: gateway,
      collection: collection,
    ),
  );

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
  ThemeData theme(Brightness brightness) => sigaTheme(brightness);
}

/// Entrada por senha. Injectável para que o teste não precise do Auth remoto.
typedef PasswordSignIn =
    Future<void> Function({
      required String email,
      required String password,
      String? captchaToken,
    });

/// Entrada por B.I., telefone ou e-mail, resolvida pelo servidor.
typedef IdentifierSignIn =
    Future<void> Function({
      required String identifier,
      required String password,
      String? captchaToken,
    });

class LoginPage extends StatefulWidget {
  const LoginPage({
    super.key,
    required this.auth,
    required this.onSync,
    this.factor,
    this.siteKey = captchaSiteKey,
    this.signIn,
    this.signInWithIdentifier,
    this.allowIdentifier = identifierLoginEnabled,
    this.buildGate = buildCaptchaGate,
  });
  final GoTrueClient auth;
  final Future<void> Function() onSync;
  final String? factor;
  final String siteKey;
  final PasswordSignIn? signIn;
  final IdentifierSignIn? signInWithIdentifier;
  final bool allowIdentifier;
  final CaptchaGate Function(String, VoidCallback) buildGate;
  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final email = TextEditingController();
  final identifier = TextEditingController();
  final password = TextEditingController();
  final code = TextEditingController();
  bool busy = false;
  bool byIdentifier = false;
  String? error;
  late final CaptchaGate captcha;
  late final IdentityLogin identityLogin = IdentityLogin(Uri.base);

  @override
  void initState() {
    super.initState();
    captcha = widget.buildGate(widget.siteKey, () {
      if (mounted) setState(() {});
    });
  }

  /// O desafio só se pode exigir onde é apresentável; onde não é, a recusa do
  /// servidor é explicada em vez de se enviar um pedido sem sinal.
  bool get demandsCaptcha =>
      widget.factor == null && captcha.configured && captcha.supported;

  Future<void> submit() async {
    if (busy) return;
    if (widget.factor == null && password.text.isEmpty) {
      setState(() {
        error = byIdentifier
            ? 'Preencha o identificador e a senha.'
            : 'Preencha o e-mail e a senha.';
      });
      return;
    }
    if (widget.factor == null && !byIdentifier && email.text.trim().isEmpty) {
      setState(() {
        error = 'Preencha o e-mail e a senha.';
      });
      return;
    }
    // O servidor exige pelo menos três caracteres; recusar aqui evita gastar
    // o limite por endereço com um pedido que nunca poderia entrar.
    if (widget.factor == null &&
        byIdentifier &&
        identifier.text.trim().length < 3) {
      setState(() {
        error = 'Introduza o seu número de B.I., telefone ou e-mail.';
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
    if (demandsCaptcha && captcha.token == null) {
      setState(() {
        error = 'Confirme que não é um robô e tente novamente.';
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
      } else if (byIdentifier) {
        final signIn = widget.signInWithIdentifier ?? _identifierSignIn;
        await signIn(
          identifier: identifier.text.trim(),
          password: credential,
          captchaToken: captcha.token,
        );
      } else {
        final signIn = widget.signIn ?? _authSignIn;
        await signIn(
          email: email.text.trim(),
          password: credential,
          captchaToken: captcha.token,
        );
      }
      password.clear();
      code.clear();
      await widget.onSync();
    } catch (failure) {
      if (mounted) {
        setState(() {
          error = authErrorMessage(
            failure,
            captchaConfigured: captcha.configured,
          );
        });
      }
    } finally {
      // Sinal de uso único: sem reset, a tentativa seguinte reenvia um sinal
      // gasto e o Auth devolve captcha_failed.
      if (widget.factor == null) captcha.reset();
      if (mounted) {
        setState(() {
          busy = false;
        });
      }
    }
  }

  /// O servidor cria a sessão; o SDK instala-a a partir do refresh token e
  /// passa a ser dono da renovação, como no login por e-mail.
  Future<void> _identifierSignIn({
    required String identifier,
    required String password,
    String? captchaToken,
  }) async {
    final token = await identityLogin.refreshToken(
      identifier: identifier,
      password: password,
      captchaToken: captchaToken,
    );
    await widget.auth.setSession(token);
  }

  Future<void> _authSignIn({
    required String email,
    required String password,
    String? captchaToken,
  }) => widget.auth.signInWithPassword(
    email: email,
    password: password,
    captchaToken: captchaToken,
  );

  @override
  void dispose() {
    captcha.dispose();
    identityLogin.dispose();
    identifier.dispose();
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
            constraints: const BoxConstraints(maxWidth: 440),
            child: Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surface,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: Theme.of(context).colorScheme.outlineVariant,
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Center(child: Brand()),
                  const SizedBox(height: 32),
                  Text(
                    widget.factor == null
                        ? 'Aceda à sua conta'
                        : 'Confirme a sua identidade',
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    widget.factor == null
                        ? 'O seu espaço escolar, num só lugar.'
                        : 'Introduza o código da aplicação de autenticação.',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                  const SizedBox(height: 24),
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
                    if (widget.allowIdentifier) ...[
                      SegmentedButton<bool>(
                        segments: const [
                          ButtonSegment(
                            value: false,
                            icon: Icon(Icons.mail_outline),
                            label: Text('E-mail'),
                          ),
                          ButtonSegment(
                            value: true,
                            icon: Icon(Icons.badge_outlined),
                            label: Text('B.I. ou telefone'),
                          ),
                        ],
                        selected: {byIdentifier},
                        onSelectionChanged: busy
                            ? null
                            : (selection) => setState(() {
                                byIdentifier = selection.first;
                                error = null;
                              }),
                      ),
                      const SizedBox(height: 16),
                    ],
                    if (byIdentifier)
                      TextField(
                        controller: identifier,
                        keyboardType: TextInputType.text,
                        autofillHints: const [AutofillHints.username],
                        decoration: const InputDecoration(
                          labelText: 'N.º de B.I., telefone ou e-mail',
                          prefixIcon: Icon(Icons.badge_outlined),
                        ),
                      )
                    else
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
                    if (demandsCaptcha) ...[
                      const SizedBox(height: 16),
                      Builder(
                        builder: (context) =>
                            captcha.build(context) ?? const SizedBox.shrink(),
                      ),
                    ] else if (!captcha.configured) ...[
                      const SizedBox(height: 16),
                      const Text(
                        'A verificação anti-robô pode estar activa no servidor '
                        'e não está configurada nesta aplicação: o pedido '
                        'seguirá sem sinal e pode ser recusado. Avise a '
                        'administração: falta HCAPTCHA_SITE_KEY.',
                      ),
                    ] else if (!captcha.supported) ...[
                      const SizedBox(height: 16),
                      const Text(
                        'Este alvo ainda não apresenta a verificação '
                        'anti-robô. Enquanto a protecção estiver activa no '
                        'servidor, use o portal original para entrar.',
                      ),
                    ],
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
                  if (error != null) ...[
                    const SizedBox(height: 16),
                    Semantics(
                      liveRegion: true,
                      child: Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Theme.of(context).colorScheme.errorContainer,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          error!,
                          style: TextStyle(
                            color: Theme.of(
                              context,
                            ).colorScheme.onErrorContainer,
                          ),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    ),
  );
}
