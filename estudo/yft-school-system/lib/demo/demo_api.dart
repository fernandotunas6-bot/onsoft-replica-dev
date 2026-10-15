// Demonstração para estudo: responde aos pedidos da API com dados fictícios
// em memória. Não contacta nenhum servidor nem o Firebase.
import 'package:dio/dio.dart';

const demoSchoolId = 'demo-escola';
const demoCurrency = 'Kz';

const _classes = [
  {
    'id': 'c10a',
    'class_name': '10.ª Classe A',
    'level': 10,
    'fee_amount': 25000,
    'fee_collection_cycle': 'term',
  },
  {
    'id': 'c11a',
    'class_name': '11.ª Classe A',
    'level': 11,
    'fee_amount': 27500,
    'fee_collection_cycle': 'term',
  },
  {
    'id': 'c12a',
    'class_name': '12.ª Classe A',
    'level': 12,
    'fee_amount': 30000,
    'fee_collection_cycle': 'year',
  },
];

const _subjects = [
  {
    'id': 's-mat',
    'name': 'Matemática',
    'class_ids': ['c10a', 'c11a', 'c12a'],
  },
  {
    'id': 's-por',
    'name': 'Língua Portuguesa',
    'class_ids': ['c10a', 'c11a', 'c12a'],
  },
  {
    'id': 's-fis',
    'name': 'Física',
    'class_ids': ['c11a', 'c12a'],
  },
  {
    'id': 's-bio',
    'name': 'Biologia',
    'class_ids': ['c10a'],
  },
  {
    'id': 's-ing',
    'name': 'Inglês',
    'class_ids': ['c10a', 'c11a'],
  },
];

const _students = [
  {
    'id': 'a1',
    'name': 'Ana Domingos',
    'class_id': 'c10a',
    'gender': 'Female',
    'dob': '2010-03-14',
    'balance': -12500,
    'parent_uid': 'p1',
    'parent_name': 'Marta Domingos',
    'parent_phone': '+244 923 000 101',
  },
  {
    'id': 'a2',
    'name': 'Bruno Kiala',
    'class_id': 'c10a',
    'gender': 'Male',
    'dob': '2010-07-02',
    'balance': 0,
    'parent_uid': 'p2',
    'parent_name': 'José Kiala',
    'parent_phone': '+244 923 000 102',
  },
  {
    'id': 'a3',
    'name': 'Carla Neto',
    'class_id': 'c11a',
    'gender': 'Female',
    'dob': '2009-11-21',
    'balance': -27500,
    'parent_uid': 'p1',
    'parent_name': 'Marta Domingos',
    'parent_phone': '+244 923 000 101',
  },
  {
    'id': 'a4',
    'name': 'Daniel Sebastião',
    'class_id': 'c11a',
    'gender': 'Male',
    'dob': '2009-01-30',
    'balance': 5000,
  },
  {
    'id': 'a5',
    'name': 'Esperança Mateus',
    'class_id': 'c12a',
    'gender': 'Female',
    'dob': '2008-05-09',
    'balance': -30000,
  },
  {
    'id': 'a6',
    'name': 'Francisco Lunda',
    'class_id': 'c12a',
    'gender': 'Male',
    'dob': '2008-09-17',
    'balance': 0,
  },
];

final _receipts = [
  {
    'id': 'r1',
    'transaction_id': 't1',
    'student_id': 'a1',
    'student_name': 'Ana Domingos',
    'amount_paid': 12500,
    'amount_to_debt': 12500,
    'balance_before': -25000,
    'balance_after': -12500,
    'currency': demoCurrency,
    'academic_year': '2026/2027',
    'fee_term': '1.º Trimestre',
    'description': 'Propina',
    'created_at': '2026-10-02T09:15:00Z',
  },
  {
    'id': 'r2',
    'transaction_id': 't2',
    'student_id': 'a3',
    'student_name': 'Carla Neto',
    'amount_paid': 27500,
    'amount_to_debt': 27500,
    'balance_before': -55000,
    'balance_after': -27500,
    'currency': demoCurrency,
    'academic_year': '2026/2027',
    'fee_term': '1.º Trimestre',
    'description': 'Propina',
    'created_at': '2026-09-20T11:40:00Z',
  },
];

const _notices = [
  {
    'id': 'n1',
    'title': 'Reunião de encarregados',
    'summary': 'Sexta-feira às 15h, no salão.',
    'body': 'Convocamos todos os encarregados para a reunião do 1.º trimestre.',
    'category': 'general',
    'read_flag': 0,
    'created_at': '2026-10-10T08:00:00Z',
  },
  {
    'id': 'n2',
    'title': 'Propina de Outubro',
    'summary': 'Prazo até 15/10.',
    'body': 'Pagamentos na secretaria ou por referência bancária.',
    'category': 'finance',
    'read_flag': 1,
    'created_at': '2026-10-01T08:00:00Z',
  },
];

final _calendar = {
  'academic_year': '2026/2027',
  'active_term': '1.º Trimestre',
  'currency': demoCurrency,
  'term_system': 3,
  'terms': [
    {
      'name': '1.º Trimestre',
      'start_date': '2026-09-01',
      'end_date': '2026-12-11',
    },
    {
      'name': '2.º Trimestre',
      'start_date': '2027-01-05',
      'end_date': '2027-04-02',
    },
    {
      'name': '3.º Trimestre',
      'start_date': '2027-04-19',
      'end_date': '2027-07-16',
    },
  ],
};

String _className(Object? id) =>
    _classes.firstWhere(
          (c) => c['id'] == id,
          orElse: () => const {'class_name': '—'},
        )['class_name']
        as String;

Map<String, dynamic> _student(Map<String, Object> s) => {
  ...s,
  'school_id': demoSchoolId,
  'class_name': _className(s['class_id']),
  'is_active': 1,
  'created_at': '2026-09-01T08:00:00Z',
};

Map<String, dynamic> demoProfile(String role) {
  const names = {
    'admin': 'Administração',
    'teacher': 'Prof. Carlos Mendes',
    'parent': 'Marta Domingos',
  };
  return {
    'uid': 'demo-$role',
    'name': names[role] ?? 'Utilizador',
    'email': '$role@demo.ao',
    'role': role,
    'school_id': demoSchoolId,
    'school_name': 'Escola Central da Luz (demonstração)',
    'school_address': 'Luanda, Angola',
    'school_motto': 'Educar para servir',
    'teacher_can_edit_results': 1,
    'created_at': '2026-09-01T08:00:00Z',
  };
}

/// [role]: 'admin', 'teacher' ou 'parent'.
Dio createDemoDio(String Function() role) {
  final dio = Dio(BaseOptions(baseUrl: 'https://demo.invalid'));
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) {
        final data = _route(options, role());
        handler.resolve(
          Response(requestOptions: options, statusCode: 200, data: data),
        );
      },
    ),
  );
  return dio;
}

Object? _route(RequestOptions o, String role) {
  final path = o.path;
  final q = o.queryParameters;
  if (o.method != 'GET') return {'success': true, 'data': <String, dynamic>{}};

  final students = _students.map(_student).toList();
  final classId = q['class_id'];

  if (path == '/api/users/me') return {'data': demoProfile(role)};
  if (path == '/api/users/me/academic-calendar') return {'data': _calendar};
  if (path.startsWith('/api/users/teachers/')) {
    return {
      'data': {
        ...demoProfile('teacher'),
        'phone': '+244 923 000 200',
        'gender': 'Male',
        'qualification': 'Licenciatura em Matemática',
        'years_experience': 8,
        'subjects_text': 'Matemática, Física',
        'staff_id': 'DOC-014',
      },
    };
  }
  if (path == '/api/classes') {
    return {
      'data': _classes.map((c) => {...c, 'school_id': demoSchoolId}).toList(),
    };
  }
  if (path == '/api/subjects') {
    final list = classId == null
        ? _subjects
        : _subjects
              .where((s) => (s['class_ids'] as List).contains(classId))
              .toList();
    return {
      'data': list.map((s) => {...s, 'school_id': demoSchoolId}).toList(),
    };
  }
  if (path == '/api/students') {
    final list = classId == null
        ? students
        : students.where((s) => s['class_id'] == classId).toList();
    return {
      'data': list,
      'meta': {'page': 1, 'limit': 25, 'total': list.length},
    };
  }
  if (path.startsWith('/api/students/')) {
    final id = path.split('/').last;
    return students.firstWhere(
      (s) => s['id'] == id,
      orElse: () => students.first,
    );
  }
  if (path == '/api/wards') {
    return {'data': students.where((s) => s['parent_uid'] == 'p1').toList()};
  }
  if (path == '/api/finance/arrears') {
    return {
      'data': students
          .where((s) => (s['balance'] as num) < 0)
          .map(
            (s) => {
              'id': s['id'],
              'name': s['name'],
              'class_id': s['class_id'],
              'class_name': s['class_name'],
              'balance': s['balance'],
            },
          )
          .toList(),
    };
  }
  if (path == '/api/finance/receipts') {
    return {
      'data': [
        for (final r in _receipts)
          {...r, 'school_id': demoSchoolId, 'parent_uid': 'p1'},
      ],
    };
  }
  if (path == '/api/notices') {
    return {
      'data': [
        for (final n in _notices) {...n, 'school_id': demoSchoolId},
      ],
    };
  }
  if (path == '/api/notices/unread-count') return {'unread_count': 1};
  if (path == '/api/parents') {
    return {
      'data': [
        {
          'uid': 'p1',
          'name': 'Marta Domingos',
          'email': 'marta@demo.ao',
          'phone': '+244 923 000 101',
          'student_count': 2,
        },
        {
          'uid': 'p2',
          'name': 'José Kiala',
          'email': 'jose@demo.ao',
          'phone': '+244 923 000 102',
          'student_count': 1,
        },
      ],
    };
  }
  if (path == '/api/grades') {
    return {
      'data': [
        {'subject_id': 's-mat', 'class_score': 24, 'exam_score': 52},
        {'subject_id': 's-por', 'class_score': 27, 'exam_score': 48},
        {'subject_id': 's-bio', 'class_score': 21, 'exam_score': 55},
      ],
    };
  }
  return {
    'data': <Object>[],
    'meta': {'page': 1, 'limit': 25, 'total': 0},
  };
}
