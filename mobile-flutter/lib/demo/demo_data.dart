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

Map<String, dynamic> _academic(String school, String role) => {
  ..._context(school, role),
  'classes': [
    {
      'classSubjectId': 'mat',
      'classGroupId': 'turma-a',
      'subjectName': 'Matemática',
      'className': '10.ª Classe · Turma A',
      'teacher': {'name': 'Carlos Mendes'},
    },
    {
      'classSubjectId': 'lp',
      'classGroupId': 'turma-a',
      'subjectName': 'Língua Portuguesa',
      'className': '10.ª Classe · Turma A',
      'teacher': {'name': 'Mariana Silva'},
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
      return {
        ..._context(school, role),
        'items': [
          {
            'title': 'Reunião de encarregados',
            'body': 'Sexta-feira, às 15h, no salão da escola.',
          },
          {
            'title': 'Calendário de provas',
            'body': 'As provas do I trimestre começam na próxima semana.',
          },
        ],
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

/// Gateway que responde localmente, com um pequeno atraso para se verem os
/// estados de carregamento. Mantém as mesmas verificações do gateway real.
MobileGateway demoGateway() => MobileGateway(
  Uri.parse('https://demonstracao.siga.invalid'),
  () async => 'demo',
  client: MockClient((request) async {
    await Future<void>.delayed(const Duration(milliseconds: 350));
    return http.Response.bytes(
      utf8.encode(jsonEncode(_response(request.url))),
      200,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );
  }),
);
