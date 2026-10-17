import 'dart:async';
import 'package:flutter/material.dart';
import 'package:fluentui_system_icons/fluentui_system_icons.dart';
import 'package:go_router/go_router.dart';
import 'academic_page.dart';
import 'demo/demo_data.dart';
import 'design/floating_nav.dart';
import 'design/portal.dart';
import 'design/tokens.dart';
import 'design/widgets.dart' show ActivityScope;
import 'identity.dart';
import 'institutional_page.dart';
import 'main.dart' show tabs, institutionalServices, messagesTab;
import 'pages/appearance_page.dart';
import 'pages/pending_page.dart';
import 'pages/absences_page.dart';
import 'pages/gradebooks_page.dart';
import 'pages/lesson_plans_page.dart';
import 'pages/profile_page.dart';
import 'pages/schools_page.dart';
import 'pages/services_page.dart';
import 'pages/side_menu.dart';
import 'pages/transport_page.dart';
import 'pages/welcome_page.dart';

/// Demonstração instalável: os ecrãs reais com dados fictícios locais.
/// Não usa o Supabase, não pede senha e não contacta nenhum servidor.
/// Compilar com `flutter build apk -t lib/main_demo.dart`.
void main() => runApp(const DemoApp());

class DemoApp extends StatefulWidget {
  const DemoApp({super.key});
  @override
  State<DemoApp> createState() => _DemoAppState();
}

class _DemoAppState extends State<DemoApp> {
  final gateway = demoGateway();
  final refresh = ValueNotifier<int>(0);
  late final GoRouter router;
  Map<String, dynamic>? session;
  SchoolChoice? choice;
  bool intro = true;
  bool welcome = true;
  bool reduced = false;
  ThemeMode mode = ThemeMode.system;
  Color accent = Siga.institutionalBlue;
  int? backdrop;
  bool modernIcons = true;

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
    if (!mounted) return;
    setState(() {});
    refresh.value++;
  }

  @override
  void initState() {
    super.initState();
    gateway.session().then((value) {
      session = value;
      update();
    });
    router = GoRouter(
      initialLocation: '/home',
      refreshListenable: refresh,
      redirect: (context, state) {
        final gate = intro
            ? '/intro'
            : welcome
            ? '/welcome'
            : choice == null
            ? '/schools'
            : null;
        if (gate != null) return state.matchedLocation == gate ? null : gate;
        return {
              '/intro',
              '/welcome',
              '/schools',
            }.contains(state.matchedLocation)
            ? '/home'
            : null;
      },
      routes: [
        GoRoute(
          path: '/intro',
          builder: (_, _) => IdentityIntro(
            onDone: () {
              intro = false;
              update();
            },
          ),
        ),
        GoRoute(
          path: '/welcome',
          builder: (_, _) => WelcomePage(
            onDone: () {
              welcome = false;
              update();
            },
          ),
        ),
        GoRoute(
          path: '/schools',
          builder: (_, _) => SchoolsPage(
            choices: SchoolChoice.fromSession(session),
            onRetry: () {},
            onSignOut: () {
              intro = true;
              update();
            },
            onSelect: (selected) {
              gateway.select(demoUserId, selected.schoolId, selected.role);
              choice = selected;
              update();
              unawaited(refreshUnread());
            },
          ),
        ),
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
  }

  void switchSchool() {
    gateway.reset();
    choice = null;
    update();
  }

  List<RouteBase> moreRoutes() => [
    GoRoute(
      path: 'classes',
      builder: (_, _) => subPage('Turmas', data('/classes')),
      routes: [
        GoRoute(
          path: ':id',
          builder: (_, state) => subPage(
            '',
            data('/class', groupId: state.pathParameters['id']),
            back: '/more/classes',
          ),
        ),
      ],
    ),
    GoRoute(
      path: 'tasks',
      builder: (_, _) => subPage('Tarefas', data('/tasks')),
    ),
    for (final (service, title) in institutionalServices)
      GoRoute(
        path: service,
        builder: (_, _) => subPage(
          title,
          InstitutionalPage(
            key: ValueKey('${choice?.schoolId}:$service'),
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
      path: 'gradebooks',
      builder: (_, _) => subPage(
        'Notas e pautas',
        GradebooksPage(
          key: ValueKey('${choice?.schoolId}:${choice?.role}'),
          gateway: gateway,
        ),
      ),
    ),
    GoRoute(
      path: 'lesson-plans',
      builder: (_, _) => subPage(
        'Planos de aula',
        LessonPlansPage(
          key: ValueKey('${choice?.schoolId}:${choice?.role}'),
          gateway: gateway,
        ),
      ),
    ),
    GoRoute(
      path: 'absences',
      builder: (_, _) => subPage(
        'Faltas',
        AbsencesPage(
          key: ValueKey('${choice?.schoolId}:${choice?.role}'),
          gateway: gateway,
        ),
      ),
    ),
    GoRoute(
      path: 'profile',
      builder: (_, _) => subPage(
        'Meu perfil',
        ProfilePage(
          name: demoName,
          schoolId: choice?.schoolId,
          role: choice?.role,
          memberships: SchoolChoice.fromSession(session),
          onNavigate: router.go,
          onSwitchSchool: switchSchool,
          onSignOut: switchSchool,
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
            mode: mode,
            accent: accent,
            reduced: reduced,
            onMode: (value) {
              mode = value;
              update();
            },
            onAccent: (value) {
              accent = value;
              update();
            },
            onReduced: (value) {
              reduced = value;
              update();
            },
            backdrop: backdrop,
            onBackdrop: (value) {
              backdrop = value;
              update();
            },
            modernIcons: modernIcons,
            onModernIcons: (value) {
              modernIcons = value;
              update();
            },
          ),
        ),
      ),
    ),
  ];

  Widget data(String path, {String? groupId}) => DataPage(
    key: ValueKey('${choice?.schoolId}:${choice?.role}:$path:$groupId'),
    gateway: gateway,
    path: path,
    name: demoName,
    groupId: groupId,
    schoolName: choice?.schoolName,
  );

  Widget page(String path) => path == '/more'
      ? ServicesPage(
          schoolName: choice?.schoolName ?? '',
          student: choice?.role == 'aluno',
          onNavigate: router.go,
          onSwitchSchool: switchSchool,
        )
      : data(path);

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
        body: body,
      );

  Widget shellPage(StatefulNavigationShell shell) => ActivityScope(
    unreadNotices: unreadNotices,
    unreadChats: unreadChats,
    refresh: () => unawaited(refreshUnread()),
    child: shellScaffold(shell),
  );

  Widget shellScaffold(StatefulNavigationShell shell) => Scaffold(
    drawer: SideMenu(
      name: demoName,
      subtitle: [choice?.roleLabel ?? '', choice?.schoolName ?? ''].join(' · '),
      student: choice?.role == 'aluno',
      dark: mode == ThemeMode.dark,
      onDark: (value) {
        mode = value ? ThemeMode.dark : ThemeMode.light;
        update();
      },
      onNavigate: router.go,
      onSwitchSchool: switchSchool,
      onSignOut: switchSchool,
    ),
    body: SafeArea(bottom: false, child: shell),
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

  @override
  void dispose() {
    gateway.dispose();
    router.dispose();
    refresh.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => MaterialApp.router(
    title: 'SIGA Plus · Demonstração',
    debugShowCheckedModeBanner: false,
    themeMode: mode,
    theme: sigaTheme(Brightness.light, accent),
    darkTheme: sigaTheme(Brightness.dark, accent),
    routerConfig: router,
    builder: (context, child) => MediaQuery(
      data: MediaQuery.of(context).copyWith(
        disableAnimations: reduced || MediaQuery.disableAnimationsOf(context),
      ),
      child: Column(
        children: [
          Expanded(
            // A faixa já ocupa a margem inferior do ecrã.
            child: MediaQuery.removePadding(
              context: context,
              removeBottom: true,
              child: AppearanceScope(
                backdrop: backdrop,
                modernIcons: modernIcons,
                // Sem portal na demonstração: o botão explica onde ir.
                child: PortalScope(url: null, child: child!),
              ),
            ),
          ),
          const DemoStrip(),
        ],
      ),
    ),
  );
}

/// Faixa permanente: nunca se confunde a demonstração com dados reais.
class DemoStrip extends StatelessWidget {
  const DemoStrip({super.key});
  @override
  Widget build(BuildContext context) => Material(
    color: const Color(0xff14161b),
    child: SafeArea(
      top: false,
      child: SizedBox(
        width: double.infinity,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Text(
            'Demonstração · dados fictícios · sem ligação ao SIGA',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: Colors.white.withValues(alpha: .85),
              fontSize: 11,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ),
    ),
  );
}
