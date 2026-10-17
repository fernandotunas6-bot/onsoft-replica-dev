import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import '../gateway.dart';

/// Dados fictícios da demonstração. Pessoas, escolas e valores são
/// inventados; nada disto vem do SIGA nem é enviado para lado nenhum.
const demoUserId = 'demo-aluno';
const demoName = 'Ana Souza';
const demoSchools = [
  ('demo-escola-luz', 'Escola Central da Luz (demonstração)', 'aluno'),
  ('demo-colegio', 'Colégio Horizonte (demonstração)', 'professor'),
];

Map<String, dynamic> _context(String school, String role) => {
  'schoolId': school,
  'role': role,
  'userId': demoUserId,
};

const _students = [
  {'studentId': 'al-1', 'enrollmentId': 'mat-1', 'name': 'Ana Souza'},
  {'studentId': 'al-2', 'enrollmentId': 'mat-2', 'name': 'Bruno Kiala'},
  {'studentId': 'al-3', 'enrollmentId': 'mat-3', 'name': 'Carla Mateus'},
  {'studentId': 'al-4', 'enrollmentId': 'mat-4', 'name': 'Daniel Neto'},
  {'studentId': 'al-5', 'enrollmentId': 'mat-5', 'name': 'Esperança Lopes'},
];

Map<String, dynamic> _academic(String school, String role) => {
  ..._context(school, role),
  'classes': [
    {
      'classSubjectId': 'mat',
      'classGroupId': 'turma-a',
      'subjectName': 'Matemática',
      'className': '10.ª Classe · Turma A',
      // Na escola de demonstração do professor, a disciplina é do utilizador.
      'teacher': {'name': 'Carlos Mendes', 'userId': demoUserId},
      'students': _students,
    },
    {
      'classSubjectId': 'lp',
      'classGroupId': 'turma-a',
      'subjectName': 'Língua Portuguesa',
      'className': '10.ª Classe · Turma A',
      'teacher': {'name': 'Mariana Silva', 'userId': demoUserId},
      'students': _students,
    },
    {
      'classSubjectId': 'cn',
      'classGroupId': 'turma-a',
      'subjectName': 'Ciências da Natureza',
      'className': '10.ª Classe · Turma A',
    },
    {
      'classSubjectId': 'hist',
      'classGroupId': 'turma-a',
      'subjectName': 'História',
      'className': '10.ª Classe · Turma A',
    },
    {
      'classSubjectId': 'ing',
      'classGroupId': 'turma-b',
      'subjectName': 'Inglês',
      'className': '11.ª Classe · Turma B',
    },
  ],
  'timetable': [
    for (var day = 1; day <= 5; day++) ...[
      {
        'classSubjectId': 'mat',
        'weekday': day,
        'startsAt': '07:30',
        'endsAt': '09:00',
        'publication': 'published',
        'room': 'Sala 3',
      },
      {
        'classSubjectId': day.isOdd ? 'lp' : 'hist',
        'weekday': day,
        'startsAt': '09:15',
        'endsAt': '10:45',
        'publication': 'published',
        'room': 'Sala 2',
      },
      {
        'classSubjectId': day.isOdd ? 'cn' : 'ing',
        'weekday': day,
        'startsAt': '11:00',
        'endsAt': '12:30',
        'publication': 'published',
        'room': 'Laboratório',
      },
      {
        'classSubjectId': 'mat',
        'weekday': day,
        'startsAt': '14:00',
        'endsAt': '15:30',
        'publication': 'published',
        'room': 'Sala 3',
      },
    ],
  ],
  'tasks': [
    {
      'classSubjectId': 'mat',
      'title': 'Ficha de equações do 2.º grau',
      'instructions': 'Resolver os exercícios 1 a 12 da ficha.',
      'due': DateTime.now()
          .toUtc()
          .add(const Duration(days: 2))
          .toIso8601String(),
    },
    {
      'classSubjectId': 'lp',
      'title': 'Resumo do capítulo 3',
      'instructions': 'Uma página, à mão ou digitada.',
      'due': DateTime.now()
          .toUtc()
          .add(const Duration(days: 5))
          .toIso8601String(),
    },
    {
      'classSubjectId': 'cn',
      'title': 'Relatório da experiência',
      'due': DateTime.now()
          .toUtc()
          .subtract(const Duration(days: 3))
          .toIso8601String(),
    },
  ],
};

Map<String, dynamic> _message(
  String id,
  String sender,
  String body,
  int minutesAgo, {
  Map<String, dynamic>? reply,
  Map<String, dynamic>? attachment,
}) => {
  'id': id,
  'senderId': sender,
  'senderName': sender == demoUserId ? demoName : 'Prof. Carlos Mendes',
  'body': body,
  'createdAt': DateTime.now()
      .toUtc()
      .subtract(Duration(minutes: minutesAgo))
      .toIso8601String(),
  'deleted': false,
  'status': 'read',
  'reply': reply,
  'attachment': attachment,
};

Map<String, dynamic> _response(Uri url) {
  final parts = url.pathSegments;
  final role = url.queryParameters['role'] ?? 'aluno';
  if (parts.last == 'session') {
    return {
      'userId': demoUserId,
      'name': demoName,
      'memberships': [
        for (final (id, name, profile) in demoSchools)
          {
            'schoolId': id,
            'schoolName': name,
            'active': true,
            'roles': [profile],
          },
      ],
    };
  }
  final school = parts[parts.indexOf('schools') + 1];
  switch (parts.last) {
    case 'academic':
      return _academic(school, role);
    case 'chat' when url.queryParameters.containsKey('conversationId'):
      return {
        ..._context(school, role),
        'conversationId': url.queryParameters['conversationId'],
        'next': null,
        'messages': [
          _message(
            'm1',
            'prof',
            'Bom dia, Ana. A ficha de equações já está publicada.',
            95,
          ),
          _message(
            'm2',
            demoUserId,
            'Bom dia, professor! Obrigada, faço hoje.',
            90,
            reply: {
              'id': 'm1',
              'body': 'A ficha de equações já está publicada.',
              'senderName': 'Prof. Carlos Mendes',
            },
          ),
          _message(
            'm3',
            'prof',
            'Envio também o resumo da aula.',
            30,
            attachment: {'id': 'a1', 'name': 'resumo-aula-3.pdf'},
          ),
        ],
      };
    case 'chat':
      return {
        ..._context(school, role),
        'threads': [
          {'id': 'c1', 'name': 'Prof. Carlos Mendes', 'unread': 2},
          {'id': 'c2', 'name': 'Turma 10.ª Classe · A', 'unread': 0},
          {'id': 'c3', 'name': 'Mariana Silva', 'unread': 1},
          {'id': 'c4', 'name': 'Direcção Pedagógica', 'unread': 0},
        ],
      };
    case 'notifications':
      final items = [
        {
          'id': 'av-1',
          'title': 'Reunião de encarregados',
          'body': 'Sexta-feira, às 15h, no salão da escola.',
          'read': _readNotices.contains('av-1'),
        },
        {
          'id': 'av-2',
          'title': 'Calendário de provas',
          'body': 'As provas do I trimestre começam na próxima semana.',
          'read': true,
        },
      ];
      return {
        ..._context(school, role),
        'unread': items.where((i) => i['read'] == false).length,
        'items': items,
      };
    case 'gradebooks':
      List<Map<String, dynamic>> scores(List<num?> values, String status) => [
        for (var i = 0; i < values.length; i++)
          {
            'enrollmentId': 'mat-${i + 1}',
            'value': values[i],
            'status': status,
          },
      ];
      return {
        ..._context(school, role),
        'books': [
          {
            'id': 'pauta-mat-1',
            'classSubjectId': 'mat',
            'term': {'id': 't1', 'name': 'I Trimestre', 'sequence': 1},
            'status': 'open',
            'items': [
              {
                'id': 'mac1',
                'code': 'MAC 1',
                'name': 'Avaliação contínua 1',
                'kind': 'continuous',
                'maxScore': 20,
                'sequence': 1,
                'assessedOn': '2026-09-26',
                'scores': scores([15, 12.5, 9, 17, 13], 'submitted'),
              },
              {
                'id': 'pp1',
                'code': 'PP',
                'name': 'Prova do professor',
                'kind': 'exam',
                'maxScore': 20,
                'sequence': 2,
                'assessedOn': '2026-10-10',
                'scores': scores([14, null, 8.5, 16, null], 'draft'),
              },
            ],
          },
          {
            'id': 'pauta-lp-1',
            'classSubjectId': 'lp',
            'term': {'id': 't1', 'name': 'I Trimestre', 'sequence': 1},
            'status': 'draft',
            'items': [],
          },
        ],
      };
    case 'lesson-plans':
      return {
        ..._context(school, role),
        'plans': [
          {
            'id': 'plano-1',
            'classSubjectId': 'mat',
            'term': 1,
            'title': 'Equações do 2.º grau',
            'content':
                'Objectivos: resolver equações completas e incompletas e '
                'interpretar o discriminante.\n\nMateriais: ficha de '
                'exercícios, quadro e calculadora.',
            'fileName': 'ficha-equacoes.pdf',
            'status': 'published',
            'updatedAt': '2026-10-05T10:00:00Z',
            'components': [
              {
                'kind': 'avaliacao',
                'name': 'Avaliação contínua',
                'plannedCount': 2,
              },
              {
                'kind': 'prova',
                'name': 'Prova do professor',
                'plannedCount': 1,
              },
            ],
          },
          {
            'id': 'plano-2',
            'classSubjectId': 'lp',
            'term': 1,
            'title': 'Texto narrativo',
            'content': null,
            'fileName': null,
            'status': 'draft',
            'updatedAt': '2026-10-08T10:00:00Z',
            'components': [],
          },
        ],
      };
    case 'chat-capabilities':
      return {'writes': true};
    case 'attendance':
      return {
        ..._context(school, role),
        'from': url.queryParameters['from'],
        'to': url.queryParameters['to'],
        ..._attendanceMonth(
          DateTime.parse(url.queryParameters['from']!),
          DateTime.parse(url.queryParameters['to']!),
          role,
        ),
      };
    case 'finance':
      return {
        ..._context(school, role),
        'invoices': [
          {
            'label': 'Propina de Outubro',
            'number': 'F-DEMO-118',
            'status': 'partially_paid',
            'amountCents': 2500000,
            'due': '2026-10-10',
            'receipts': [
              {
                'number': 'R-DEMO-77',
                'amountCents': 1000000,
                'status': 'issued',
              },
            ],
          },
          {
            'label': 'Propina de Setembro',
            'number': 'F-DEMO-097',
            'status': 'paid',
            'amountCents': 2500000,
            'due': '2026-09-10',
            'receipts': [
              {
                'number': 'R-DEMO-51',
                'amountCents': 2500000,
                'status': 'issued',
              },
            ],
          },
        ],
      };
    case 'documents':
      return {
        ..._context(school, role),
        'requests': [
          {'document': 'Declaração de matrícula', 'status': 'approved'},
          {'document': 'Certificado de habilitações', 'status': 'in_review'},
          {'document': 'Histórico escolar', 'status': 'fulfilled'},
        ],
      };
    case 'results':
      return {
        ..._context(school, role),
        'sheets': [
          {
            'title': 'Pauta do I Trimestre',
            'termAverage': 14.6,
            'result': 'Transita',
          },
        ],
      };
  }
  throw StateError('Serviço sem dados de demonstração.');
}

/// Presenças fictícias: dias úteis até hoje, Matemática e Língua Portuguesa,
/// com faltas e atrasos em dias fixos para o padrão ser estável.
Map<String, dynamic> _attendanceMonth(DateTime from, DateTime to, String role) {
  final today = DateTime.now();
  final sessions = <Map<String, dynamic>>[];
  for (
    var d = from;
    !d.isAfter(to) && !d.isAfter(today);
    d = d.add(const Duration(days: 1))
  ) {
    if (d.weekday > 5) continue;
    final date =
        '${d.year}-${d.month.toString().padLeft(2, '0')}-'
        '${d.day.toString().padLeft(2, '0')}';
    for (final subject in ['mat', 'lp']) {
      final isToday =
          d.year == today.year && d.month == today.month && d.day == today.day;
      if (subject == 'mat' && isToday && !_attendanceDone) {
        sessions.add({
          'id': 'sessao-$date-$subject',
          'classSubjectId': subject,
          'date': date,
          'status': 'pending',
          'records': [],
        });
        continue;
      }
      String status(int student) {
        final key = d.day + student + (subject == 'lp' ? 3 : 0);
        if (key % 11 == 0) return 'absent';
        if (key % 13 == 0) return 'late';
        if (key % 17 == 0) return 'excused';
        return 'present';
      }

      final records = subject == 'mat' && isToday
          ? _attendanceRecords
          : [
              for (var i = 0; i < _students.length; i++)
                {'studentId': _students[i]['studentId'], 'status': status(i)},
            ];
      sessions.add({
        'id': 'sessao-$date-$subject',
        'classSubjectId': subject,
        'date': date,
        'status': d.day % 9 == 0 && subject == 'lp' ? 'pending' : 'completed',
        // O aluno recebe só o seu registo, como no servidor.
        'records': role == 'aluno' ? [records.first] : records,
      });
    }
  }
  return {
    'sessions': sessions,
    'teacherLessons': [
      if (role == 'professor')
        for (final s in sessions)
          {
            'id': 'aula-${s['id']}',
            'classSubjectId': s['classSubjectId'],
            'date': s['date'],
            'status': s['status'] == 'completed' ? 'confirmed' : 'scheduled',
          },
    ],
  };
}

// Estado das escritas da demonstração: só em memória, nunca sai do aparelho.
final _readNotices = <String>{};
var _attendanceDone = false;
var _attendanceRecords = <Map<String, dynamic>>[];
var _sent = 0;

Map<String, dynamic> _command(Uri url, Map<String, dynamic> body) {
  final parts = url.pathSegments;
  final school = parts[parts.indexOf('schools') + 1];
  final role = body['role'] as String;
  switch (parts.last) {
    case 'notifications-read':
      if (body['all'] == true) {
        _readNotices.add('av-1');
      } else {
        _readNotices.addAll((body['ids'] as List).cast<String>());
      }
      return {..._context(school, role), 'updated': 1, 'unread': 0};
    case 'attendance-call':
      _attendanceDone = true;
      _attendanceRecords = (body['records'] as List)
          .cast<Map<String, dynamic>>();
      return {
        ..._context(school, role),
        'classSubjectId': body['classSubjectId'],
        'sessionId': 'sessao-demo',
        'date': body['date'],
        'count': _attendanceRecords.length,
        'status': 'completed',
      };
    case 'chat-commands':
      final command = body['command'] as Map<String, dynamic>;
      return {
        'type': command['type'],
        'conversationId': command['conversationId'],
        'messageId': command['type'] == 'send' ? 'demo-envio-${++_sent}' : null,
      };
  }
  throw StateError('Acção sem simulação na demonstração.');
}

/// Gateway que responde localmente, com um pequeno atraso para se verem os
/// estados de carregamento. Mantém as mesmas verificações do gateway real.
MobileGateway demoGateway() => MobileGateway(
  Uri.parse('https://demonstracao.siga.invalid'),
  () async => 'demo',
  client: MockClient((request) async {
    await Future<void>.delayed(const Duration(milliseconds: 350));
    final result = request.method == 'POST'
        ? _command(
            request.url,
            jsonDecode(request.body) as Map<String, dynamic>,
          )
        : _response(request.url);
    return http.Response.bytes(
      utf8.encode(jsonEncode(result)),
      200,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );
  }),
);
