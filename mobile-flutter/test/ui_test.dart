import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:siga_plus_flutter/academic_page.dart';
import 'package:siga_plus_flutter/design/floating_nav.dart';
import 'package:siga_plus_flutter/design/tokens.dart';
import 'package:siga_plus_flutter/design/widgets.dart';
import 'package:siga_plus_flutter/gateway.dart';
import 'package:siga_plus_flutter/identity.dart';
import 'package:siga_plus_flutter/pages/appearance_page.dart';
import 'package:siga_plus_flutter/pages/schools_page.dart';
import 'package:siga_plus_flutter/pages/transport_page.dart';
import 'package:siga_plus_flutter/pages/welcome_page.dart';

Widget app(Widget child, {double width = 390}) => MaterialApp(
  theme: sigaTheme(Brightness.light, Siga.institutionalBlue),
  home: MediaQuery(
    data: MediaQueryData(size: Size(width, 844)),
    child: Scaffold(body: child),
  ),
);

Map<String, dynamic> catalog() => {
  'schoolId': 'school-a',
  'role': 'aluno',
  'classes': [
    {
      'classSubjectId': 'math',
      'classGroupId': 'class-a',
      'subjectName': 'Matemática',
      'className': 'Turma A — Manhã',
      'teacher': {'name': 'Carlos Mendes'},
    },
    {
      'classSubjectId': 'port',
      'classGroupId': 'class-a',
      'subjectName': 'Língua Portuguesa',
      'className': 'Turma A — Manhã',
    },
  ],
  'timetable': [
    for (var day = 1; day <= 7; day++)
      {
        'classSubjectId': 'math',
        'weekday': day,
        'startsAt': '00:00',
        'endsAt': '23:59',
        'publication': 'published',
        'room': 'Sala 3',
      },
  ],
  'tasks': [
    {
      'classSubjectId': 'math',
      'title': 'Ficha de equações',
      'due': '2099-01-10T10:00:00Z',
    },
  ],
};

MobileGateway gatewayFor(Map<String, dynamic> body) {
  final gateway = MobileGateway(
    Uri.parse('https://example.test'),
    () async => 'token',
    client: MockClient(
      (_) async => http.Response.bytes(
        utf8.encode(jsonEncode(body)),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      ),
    ),
  );
  gateway.select('user', 'school-a', 'aluno');
  return gateway;
}

Future<void> showData(
  WidgetTester tester,
  String path, {
  Map<String, dynamic>? body,
  String? groupId,
}) async {
  await tester.pumpWidget(
    app(
      DataPage(
        gateway: gatewayFor(body ?? catalog()),
        path: path,
        name: 'Ana Souza',
        schoolName: 'Escola Central da Luz',
        groupId: groupId,
      ),
    ),
  );
  await tester.pumpAndSettle();
}

/// O DataPage tem um relógio periódico: desmontar no fim cancela-o.
Future<void> unmount(WidgetTester tester) =>
    tester.pumpWidget(const SizedBox());

void main() {
  group('abertura do S', () {
    test('a mensagem abre, fica legível e recolhe no S', () {
      const t = IntroTimeline.full;
      expect(t.reveal(.05), 0);
      expect(t.reveal(.47), 1);
      expect(t.reveal(.66), inExclusiveRange(0, 1));
      expect(t.reveal(.85), 0);
      expect(t.left(.85), 0);
      expect(t.left(1), 1);
    });

    test('a versão curta nunca abre a mensagem', () {
      for (var x = 0.0; x <= 1; x += .05) {
        expect(IntroTimeline.short.reveal(x), 0);
      }
      expect(IntroTimeline.short.duration.inMilliseconds, lessThan(1500));
    });

    testWidgets('o S dilata e revela «Seja bem-vindo», depois volta ao logo', (
      tester,
    ) async {
      Future<void> frame(double reveal) => tester.pumpWidget(
        app(IntroFrame(enter: 1, reveal: reveal, progress: .5)),
      );
      double opacityOf(String text) => tester
          .widgetList<Opacity>(
            find.ancestor(of: find.text(text), matching: find.byType(Opacity)),
          )
          .fold(1.0, (value, o) => value * o.opacity);
      await frame(0);
      expect(opacityOf('Seja bem-vindo'), 0);
      expect(opacityOf('Ao SIGA Plus'), 0);
      await frame(1);
      expect(opacityOf('Seja bem-vindo'), 1);
      expect(opacityOf('Ao SIGA Plus'), 1);
      // O mesmo S, maior, continua no ecrã durante a mensagem.
      final scale = tester
          .widgetList<Transform>(
            find.ancestor(
              of: find.byType(MorphingMark),
              matching: find.byType(Transform),
            ),
          )
          .first
          .transform
          .getMaxScaleOnAxis();
      expect(scale, greaterThan(1.5));
      expect(find.byType(LinearProgressIndicator), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  testWidgets('a barra inferior troca de separador e marca o activo', (
    tester,
  ) async {
    var selected = 0;
    await tester.pumpWidget(
      app(
        StatefulBuilder(
          builder: (context, setState) => Align(
            alignment: Alignment.bottomCenter,
            child: FloatingNavBar(
              items: const [
                NavItem(Icons.home_outlined, Icons.home, 'Início'),
                NavItem(
                  Icons.menu_book_outlined,
                  Icons.menu_book,
                  'Disciplinas',
                ),
                NavItem(Icons.more_horiz, Icons.more_horiz, 'Mais'),
              ],
              index: selected,
              onSelected: (i) => setState(() => selected = i),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Disciplinas'));
    await tester.pumpAndSettle();
    expect(selected, 1);
    expect(
      tester.getSemantics(find.bySemanticsLabel('Disciplinas')),
      matchesSemantics(
        isButton: true,
        isSelected: true,
        hasSelectedState: true,
      ),
    );
  });

  group('ecrãs com dados', () {
    testWidgets(
      'início (ecrã 7): saudação, aula agora, disciplinas, actividades',
      (tester) async {
        await showData(tester, '/home');
        expect(find.text('Bem-vindo, Ana!'), findsOneWidget);
        expect(find.text('Aluno · Turma A — Manhã'), findsOneWidget);
        expect(find.text('Aula agora'), findsOneWidget);
        expect(find.text('Entrar'), findsOneWidget);
        expect(find.text('Ver todas'), findsOneWidget);
        expect(find.text('Próximas actividades'), findsOneWidget);
        // O início das referências não tem a grelha de serviços.
        expect(find.text('Serviços escolares'), findsNothing);
        await tester.scrollUntilVisible(
          find.text('Ficha de equações'),
          200,
          scrollable: find.byType(Scrollable).first,
        );
        expect(find.text('Ficha de equações'), findsOneWidget);
        await unmount(tester);
      },
    );

    testWidgets('calendário: semana com o dia escolhido e as aulas', (
      tester,
    ) async {
      await showData(tester, '/calendar');
      expect(find.text('Agenda'), findsOneWidget);
      expect(find.text('Horários'), findsOneWidget);
      expect(find.text('Seg'), findsOneWidget);
      expect(find.text('Sex'), findsOneWidget);
      expect(find.text('Dom'), findsNothing);
      final today = DateTime.now().toUtc().add(const Duration(hours: 1));
      if (today.weekday <= 5) {
        expect(find.textContaining('Hoje · '), findsOneWidget);
      }
      await tester.tap(find.text('Horários'));
      await tester.pumpAndSettle();
      expect(find.text('Segunda'), findsOneWidget);
      expect(find.text('Sexta'), findsOneWidget);
      await unmount(tester);
    });

    testWidgets('mensagens: «Não lidas» filtra as conversas', (tester) async {
      await showData(
        tester,
        '/messages',
        body: {
          'schoolId': 'school-a',
          'role': 'aluno',
          'userId': 'user',
          'threads': [
            {'name': 'Prof. Carlos Mendes', 'unread': 2},
            {'name': 'Mariana Silva', 'unread': 0},
          ],
        },
      );
      expect(find.text('Mariana Silva'), findsOneWidget);
      await tester.tap(find.text('Não lidas'));
      await tester.pumpAndSettle();
      expect(find.text('Mariana Silva'), findsNothing);
      expect(find.text('2 mensagens por ler'), findsOneWidget);
      // Favoritas só mostra o que foi marcado neste dispositivo.
      await tester.tap(find.text('Favoritas'));
      await tester.pumpAndSettle();
      expect(find.text('Prof. Carlos Mendes'), findsNothing);
      expect(
        find.text('Sem favoritas. Toque longo numa conversa para a marcar.'),
        findsOneWidget,
      );
      await unmount(tester);
    });

    testWidgets('turma: espaço com serviços honestos sobre o que falta', (
      tester,
    ) async {
      await showData(tester, '/class', groupId: 'class-a');
      expect(find.text('Turma A — Manhã'), findsOneWidget);
      for (final text in [
        'Disciplinas',
        'Professores',
        'Aulas',
        'Conteúdos e tarefas',
        'Materiais, actividades e avaliações',
        'Grupo WhatsApp',
        'Convite institucional da turma',
        'Aulas online',
        'Zoom, Meet ou BigBlueButton',
        'Horário da turma',
        'Aulas presenciais e virtuais',
        'Presenças e notas',
        'Conforme o perfil autorizado',
      ]) {
        expect(find.text(text), findsOneWidget, reason: text);
      }
      await tester.tap(find.text('Professores'));
      await tester.pumpAndSettle();
      expect(find.text('Carlos Mendes'), findsOneWidget);
      await unmount(tester);
    });

    testWidgets('dados fora do catálogo mostram erro, não um ecrã vazio', (
      tester,
    ) async {
      await showData(
        tester,
        '/subjects',
        body: {'schoolId': 'school-a', 'role': 'aluno', 'classes': []},
      );
      expect(find.textContaining('não correspondem'), findsOneWidget);
      expect(find.text('Tentar novamente'), findsOneWidget);
      await unmount(tester);
    });
  });

  test('iniciais ignoram títulos e nunca ficam vazias', () {
    expect(InitialsAvatar.initials('Prof. Carlos Mendes'), 'CM');
    expect(InitialsAvatar.initials('Ana'), 'A');
    expect(InitialsAvatar.initials('  '), 'S');
  });

  test('o selector só mostra vínculos activos e perfis conhecidos', () {
    final choices = SchoolChoice.fromSession({
      'memberships': [
        {
          'schoolId': 'a',
          'schoolName': 'Colégio Luz do Mundo',
          'active': true,
          'roles': ['professor', 'aluno', 'admin'],
        },
        {
          'schoolId': 'b',
          'schoolName': 'Arquivada',
          'active': false,
          'roles': ['aluno'],
        },
      ],
    });
    expect(choices.map((c) => '${c.schoolId}:${c.role}'), [
      'a:professor',
      'a:aluno',
    ]);
  });

  testWidgets('sem vínculos, o selector explica como pedir acesso', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: SchoolsPage(
          choices: const [],
          onSelect: (_) {},
          onSignOut: () {},
          onRetry: () {},
        ),
      ),
    );
    expect(find.text('Sem escola por enquanto'), findsOneWidget);
  });

  testWidgets('aparência devolve tema, cor e movimento escolhidos', (
    tester,
  ) async {
    ThemeMode? mode;
    Color? accent;
    bool? reduced;
    await tester.pumpWidget(
      app(
        AppearancePage(
          mode: ThemeMode.system,
          accent: Siga.institutionalBlue,
          reduced: false,
          onMode: (v) => mode = v,
          onAccent: (v) => accent = v,
          onReduced: (v) => reduced = v,
        ),
      ),
    );
    await tester.tap(find.text('Escuro'));
    await tester.tap(find.bySemanticsLabel('Cor principal: Verde-água'));
    await tester.tap(find.byType(Switch));
    expect(mode, ThemeMode.dark);
    expect(accent, Siga.accents[3].$2);
    expect(reduced, isTrue);
  });

  testWidgets('transporte diz que é simulação e não mostra GPS real', (
    tester,
  ) async {
    await tester.pumpWidget(app(const TransportPage()));
    expect(find.text('Simulação'), findsOneWidget);
    expect(
      find.text('Trajecto ilustrativo, sem localização GPS real'),
      findsOneWidget,
    );
    expect(find.byType(FilledButton), findsNothing);
  });

  testWidgets('apresentação: avança até «Começar» e também se pode saltar', (
    tester,
  ) async {
    var done = 0;
    await tester.pumpWidget(app(WelcomePage(onDone: () => done++)));
    expect(find.text('Tudo o que a sua escola precisa'), findsOneWidget);
    await tester.tap(find.byTooltip('Seguinte'));
    await tester.pumpAndSettle();
    expect(find.text('A sua turma, organizada'), findsOneWidget);
    await tester.tap(find.byTooltip('Seguinte'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Começar'));
    expect(done, 1);
    await tester.tap(find.text('Saltar'));
    expect(done, 2);
  });
}
