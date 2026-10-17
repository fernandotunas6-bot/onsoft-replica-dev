import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:siga_plus_flutter/gateway.dart';
import 'package:siga_plus_flutter/pages/absences_page.dart';

void main() {
  Map<String, dynamic> academic(String role) => {
    'schoolId': 'school',
    'role': role,
    'classes': [
      {
        'classSubjectId': 'mat',
        'classGroupId': 'g',
        'className': '10.ª A',
        'subjectName': 'Matemática',
        'teacher': {'name': 'Prof', 'userId': 'user'},
        'students': [
          {'studentId': 's1', 'name': 'Ana', 'userId': 'user'},
          {'studentId': 's2', 'name': 'Rui', 'userId': 'other'},
        ],
      },
    ],
    'timetable': [],
    'tasks': [],
  };

  Map<String, dynamic> session(String date, String status, String mine) => {
    'classSubjectId': 'mat',
    'date': date,
    'status': status,
    'records': [
      {'studentId': 's1', 'status': mine},
      {'studentId': 's2', 'status': 'absent'},
    ],
  };

  Future<void> show(WidgetTester tester, String role) async {
    final gateway = MobileGateway(
      Uri.parse('https://example.test'),
      () async => 'token',
      client: MockClient((request) async {
        final body = request.url.path.endsWith('/academic')
            ? academic(role)
            : {
                'schoolId': 'school',
                'role': role,
                'userId': 'user',
                'sessions': [
                  session('2026-10-01', 'completed', 'present'),
                  session('2026-10-02', 'completed', 'absent'),
                  session('2026-10-05', 'completed', 'late'),
                  session('2026-10-06', 'pending', 'present'),
                ],
                'teacherLessons': [],
              };
        return http.Response.bytes(
          utf8.encode(jsonEncode(body)),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }),
    );
    gateway.select('user', 'school', role);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: AbsencesPage(gateway: gateway)),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('aluno: assiduidade só com os seus registos', (tester) async {
    await show(tester, 'aluno');
    // 4 registos do aluno (s1): presente, falta, atraso, presente → 75 %.
    expect(find.text('75%'), findsOneWidget);
    expect(find.text('Falta 1'), findsOneWidget);
    expect(find.text('Atraso 1'), findsOneWidget);
    expect(find.text('1 falta · 4 aulas'), findsOneWidget);
  });

  testWidgets('professor: chamadas por fechar primeiro', (tester) async {
    await show(tester, 'professor');
    expect(find.text('Por fechar'), findsWidgets);
    final pending = tester.getTopLeft(find.textContaining('6 de Outubro'));
    final closed = tester.getTopLeft(find.textContaining('5 de Outubro'));
    expect(pending.dy, lessThan(closed.dy));
    expect(find.textContaining('1 de 2 presentes'), findsWidgets);
  });
}
