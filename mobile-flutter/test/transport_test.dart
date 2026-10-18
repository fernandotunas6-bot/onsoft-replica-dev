import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:siga_plus_flutter/design/tokens.dart';
import 'package:siga_plus_flutter/gateway.dart';
import 'package:siga_plus_flutter/pages/transport_page.dart';

http.Response json(Object body, [int status = 200]) => http.Response.bytes(
  utf8.encode(jsonEncode(body)),
  status,
  headers: {'content-type': 'application/json; charset=utf-8'},
);

const context = {'schoolId': 'school', 'userId': 'user', 'role': 'aluno'};

MobileGateway gateway(
  Future<http.Response> Function(http.Request) handler, {
  String role = 'aluno',
}) {
  final g = MobileGateway(
    Uri.parse('https://example.test'),
    () async => 'token',
    client: MockClient(handler),
  );
  g.select('user', 'school', role);
  return g;
}

Map<String, dynamic> route({
  String status = 'normal',
  String direction = 'both',
}) => {
  'routeId': 'r1',
  'routeName': 'Rota Kilamba',
  'direction': direction,
  'stop': {
    'id': 's3',
    'sequence': 3,
    'name': 'Bloco Q',
    'landmark': 'Em frente à farmácia',
    'outboundTime': '06:40',
    'returnTime': '17:10',
  },
  'stopsCount': 7,
  'vehicle': {
    'plate': 'LD-45-12-AB',
    'label': 'Autocarro 2',
    'driverName': 'Sr. Manuel',
    'driverPhone': '923 000 111',
  },
  'today': {
    'status': status,
    'delayMinutes': status == 'delayed' ? 15 : 0,
    'note': status == 'normal' ? null : 'Trânsito na via expressa.',
  },
};

Future<void> show(WidgetTester tester, MobileGateway g) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: sigaTheme(Brightness.light, Siga.institutionalBlue),
      home: Scaffold(body: TransportPage(gateway: g)),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  test(
    'gateway: pede só o transporte do aluno e confirma o contexto',
    () async {
      final calls = <Uri>[];
      final g = gateway((request) async {
        calls.add(request.url);
        return json({
          ...context,
          'routes': [route()],
        });
      });
      final routes = await g.transport();
      expect(routes.single['routeName'], 'Rota Kilamba');
      expect(calls.single.path, '/api/mobile-v4/schools/school/transport');
      expect(calls.single.queryParameters, {'role': 'aluno'});

      final other = gateway(
        (_) async => json({...context, 'userId': 'outro', 'routes': []}),
      );
      expect(other.transport(), throwsStateError);

      var asked = false;
      final teacher = gateway((_) async {
        asked = true;
        return json({});
      }, role: 'professor');
      expect(await teacher.transport(), isEmpty);
      expect(asked, isFalse);
    },
  );

  testWidgets('aluno vê a paragem, as horas, o motorista e o atraso de hoje', (
    tester,
  ) async {
    await show(
      tester,
      gateway(
        (_) async => json({
          ...context,
          'routes': [route(status: 'delayed')],
        }),
      ),
    );
    expect(find.text('Hoje · Atrasada cerca de 15 min'), findsOneWidget);
    expect(find.text('Trânsito na via expressa.'), findsOneWidget);
    expect(find.text('Bloco Q'), findsOneWidget);
    expect(find.text('Paragem 3 de 7 · Em frente à farmácia'), findsOneWidget);
    expect(find.text('06:40'), findsOneWidget);
    expect(find.text('17:10'), findsOneWidget);
    expect(find.text('Motorista: Sr. Manuel'), findsOneWidget);
    expect(find.byTooltip('Ligar ao motorista'), findsOneWidget);
  });

  testWidgets('rota só de ida não mostra a hora de volta', (tester) async {
    await show(
      tester,
      gateway(
        (_) async => json({
          ...context,
          'routes': [route(status: 'cancelled', direction: 'outbound')],
        }),
      ),
    );
    expect(find.text('Hoje · Sem serviço hoje'), findsOneWidget);
    expect(find.text('Só ida'), findsOneWidget);
    expect(find.text('17:10'), findsNothing);
  });

  testWidgets('sem rota atribuída diz que não tem transporte', (tester) async {
    await show(tester, gateway((_) async => json({...context, 'routes': []})));
    expect(find.text('Não tem transporte escolar atribuído.'), findsOneWidget);
  });

  testWidgets('sem a migração, explica que ainda não está activo', (
    tester,
  ) async {
    await show(
      tester,
      gateway((_) async => json({'error': 'TRANSPORT_NOT_READY'}, 503)),
    );
    expect(
      find.text('O transporte escolar ainda não está activo nesta escola.'),
      findsOneWidget,
    );
  });
}
