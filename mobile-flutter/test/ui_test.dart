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
      expect(t.reveal(.8), 0);
      expect(t.branded(.7), 0);
      expect(t.branded(.95), 1);
    });

    test('a versão curta nunca abre a mensagem', () {
      for (var x = 0.0; x <= 1; x += .05) {
        expect(IntroTimeline.short.reveal(x), 0);
      }
      expect(IntroTimeline.short.duration.inMilliseconds, lessThan(1500));
    });

    testWidgets('o S fica no lugar enquanto «eja bem-vindo» se desdobra', (
      tester,
    ) async {
      await tester.pumpWidget(
        app(const Center(child: MorphingMark(reveal: 0))),
      );
      final closed = tester.getSize(find.byType(MorphingMark)).width;
      await tester.pumpWidget(
        app(const Center(child: MorphingMark(reveal: 1))),
      );
      final open = tester.getSize(find.byType(MorphingMark)).width;
      expect(find.text('S'), findsOneWidget);
      expect(find.text('eja bem-vindo'), findsOneWidget);
      expect(open, greaterThan(closed * 2));
      await tester.pumpWidget(
        app(const Center(child: MorphingMark(reveal: 1)), width: 320),
      );
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
    testWidgets('início: saudação, próxima aula, serviços e actividades', (
      tester,
    ) async {
      await showData(tester, '/home');
      expect(find.text('Bem-vindo, Ana!'), findsOneWidget);
      expect(find.text('Aluno · Escola Central da Luz'), findsOneWidget);
      expect(find.text('Aula agora'), findsOneWidget);
      expect(find.text('Serviços escolares'), findsOneWidget);
      for (final service in [
        'Turmas',
        'Tarefas',
        'Transporte',
        'Calendário',
        'Avisos',
        'Propinas',
        'Notas',
      ]) {
        expect(find.text(service), findsOneWidget);
      }
      await tester.scrollUntilVisible(
        find.text('Ficha de equações'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('Ficha de equações'), findsOneWidget);
      await unmount(tester);
    });

    testWidgets('calendário: semana com o dia escolhido e as aulas', (
      tester,
    ) async {
      await showData(tester, '/calendar');
      expect(find.textContaining('Hoje · '), findsOneWidget);
      expect(find.text('Seg'), findsOneWidget);
      expect(find.text('Dom'), findsOneWidget);
      expect(find.text('Matemática'), findsOneWidget);
      await tester.tap(find.byTooltip('Semana seguinte'));
      await tester.pumpAndSettle();
      expect(find.text('Hoje'), findsOneWidget);
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
      await unmount(tester);
    });

    testWidgets('turma: espaço com serviços honestos sobre o que falta', (
      tester,
    ) async {
      await showData(tester, '/class', groupId: 'class-a');
      expect(find.text('Turma A — Manhã'), findsOneWidget);
      expect(find.text('2 disciplinas'), findsOneWidget);
      expect(find.text('1 professor'), findsOneWidget);
      expect(find.text('Por activar'), findsNWidgets(3));
      await tester.tap(find.text('Grupo WhatsApp'));
      await tester.pumpAndSettle();
      expect(find.textContaining('não permite criar'), findsOneWidget);
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
}
