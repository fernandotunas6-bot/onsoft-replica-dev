import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:siga_plus_flutter/gateway.dart';
import 'package:siga_plus_flutter/pages/attendance_page.dart';

void main() {
  MobileGateway gateway(List<http.Request> posts, {String session = 'none'}) {
    final g = MobileGateway(
      Uri.parse('https://example.test'),
      () async => 'token',
      client: MockClient((request) async {
        if (request.method == 'POST') {
          posts.add(request);
          return http.Response(
            jsonEncode({'schoolId': 'school', 'status': 'completed'}),
            200,
          );
        }
        return http.Response(
          jsonEncode({
            'schoolId': 'school',
            'role': 'professor',
            'sessions': [
              if (session != 'none')
                {
                  'classSubjectId': 'cs',
                  'status': session,
                  'records': [
                    {'studentId': 'b', 'status': 'late'},
                  ],
                },
            ],
          }),
          200,
        );
      }),
    );
    g.select('user', 'school', 'professor');
    return g;
  }

  Widget page(MobileGateway g) => MaterialApp(
    home: AttendancePage(
      gateway: g,
      classSubjectId: 'cs',
      subjectName: 'Matemática',
      className: '10.ª Classe · Turma A',
      students: const [('a', 'Ana Souza'), ('b', 'Bruno Kiala')],
    ),
  );

  testWidgets('chamada: alterna falta, grava e fecha', (tester) async {
    final posts = <http.Request>[];
    await tester.pumpWidget(page(gateway(posts)));
    await tester.pumpAndSettle();
    expect(find.text('2 de 2 presentes'), findsOneWidget);
    await tester.tap(find.text('Bruno Kiala'));
    await tester.pumpAndSettle();
    expect(find.text('1 de 2 presentes'), findsOneWidget);
    await tester.tap(find.text('Gravar chamada'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Gravar e fechar'));
    await tester.pumpAndSettle();
    final body = jsonDecode(posts.single.body) as Map<String, dynamic>;
    expect(body['classSubjectId'], 'cs');
    expect(body['records'], [
      {'studentId': 'a', 'status': 'present'},
      {'studentId': 'b', 'status': 'absent'},
    ]);
    expect(find.textContaining('gravada no SIGA'), findsWidgets);
    expect(find.text('Gravar chamada'), findsNothing);
  });

  testWidgets('chamada já fechada no SIGA fica só de leitura', (tester) async {
    final posts = <http.Request>[];
    await tester.pumpWidget(page(gateway(posts, session: 'completed')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Correcções'), findsOneWidget);
    expect(find.text('Atraso'), findsOneWidget);
    expect(find.text('Gravar chamada'), findsNothing);
    await tester.tap(find.text('Bruno Kiala'));
    await tester.pumpAndSettle();
    expect(find.text('Atraso'), findsOneWidget);
    expect(posts, isEmpty);
  });
}
