// Testes de contrato: as respostas em fixtures/ foram geradas pelo worker real
// (school-worker/test/contract.spec.ts, D1 com migrações). Aqui confirma-se
// que repositórios e modelos do app as lêem. Para actualizar os ficheiros:
// school-worker/scripts/update-contract-fixtures.sh
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:yft_school_system/core/repositories/attendance_repository.dart';
import 'package:yft_school_system/core/repositories/class_repository.dart';
import 'package:yft_school_system/core/repositories/conversations_repository.dart';
import 'package:yft_school_system/core/repositories/grades_repository.dart';
import 'package:yft_school_system/core/repositories/notices_repository.dart';
import 'package:yft_school_system/core/repositories/subject_repository.dart';
import 'package:yft_school_system/core/repositories/timetable_repository.dart';
import 'package:yft_school_system/core/repositories/user_repository.dart';

/// Responde a cada pedido com o ficheiro indicado para "MÉTODO caminho".
class _FixtureAdapter implements HttpClientAdapter {
  final Map<String, String> routes;
  final List<String> seen = [];

  _FixtureAdapter(this.routes);

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final key = '${options.method} ${options.uri.path}';
    seen.add(key);
    final file = routes[key];
    if (file == null) {
      return ResponseBody.fromString('{"error":"sem fixture para $key"}', 404,
          headers: {Headers.contentTypeHeader: ['application/json']});
    }
    final body = File('test/contract/fixtures/$file.json').readAsStringSync();
    return ResponseBody.fromString(body, 200,
        headers: {Headers.contentTypeHeader: ['application/json']});
  }

  @override
  void close({bool force = false}) {}
}

Dio _dio(Map<String, String> routes) =>
    Dio(BaseOptions(baseUrl: 'https://worker.test'))
      ..httpClientAdapter = _FixtureAdapter(routes);

Map<String, dynamic> _fixture(String name) =>
    jsonDecode(File('test/contract/fixtures/$name.json').readAsStringSync())
        as Map<String, dynamic>;

void main() {
  test('horário: tempos com disciplina, pausa e professor', () async {
    final repo = TimetableRepository(_dio({
      'GET /api/timetable': 'timetable',
    }));
    final slots = await repo.getSlots();
    expect(slots.map((s) => s.label), ['Matemática', 'Almoço']);
    final mat = slots.first;
    expect(mat.weekday, 1);
    expect(mat.caption, '09:00 – 10:30 · Sala 3');
    expect(mat.teacherName, 'Carlos Mendes');
    expect(mat.teacherUid, 'q-tch');
    expect(mat.className, '10ª Classe');
    expect(slots.last.isBreak, isTrue);
  });

  test('presenças: lista, por marcar, resumo e histórico', () async {
    final routes = {
      'GET /api/attendance': 'attendance_roster',
      'GET /api/attendance/summary': 'attendance_summary',
      'GET /api/attendance/student/q-st': 'attendance_student',
    };
    final repo = AttendanceRepository(_dio(routes));
    final roster = await repo.getRoster('q-c10', DateTime(2026, 3, 2));
    expect(roster.marked, isTrue);
    expect(roster.entries.single.present, isFalse);

    final unmarked = AttendanceRepository(
      _dio({'GET /api/attendance': 'attendance_roster_unmarked'}),
    );
    final r2 = await unmarked.getRoster('q-c10', DateTime(2026, 3, 3));
    expect(r2.marked, isFalse);
    expect(r2.entries.single.present, isNull);

    final summary = await repo.summary('q-c10');
    expect(summary.daysMarked, 1);
    expect(summary.students.single.absentDays, 1);

    final h = await repo.forStudent('q-st');
    expect(h.absentDays, 1);
    expect(h.absences, ['2026-03-02']);
  });

  test('boletim: notas com ano lectivo e total', () async {
    final card = await GradesRepository(
      _dio({'GET /api/grades': 'grades'}),
    ).getReportCard(studentId: 'q-st', term: 'Term 1');
    expect(card.academicYear, '2025/2026');
    expect(card.lines.single.subjectName, 'Matemática');
    expect(card.lines.single.total, 82.5);
  });

  test('boletim: anos lectivos com notas', () async {
    final y = await GradesRepository(
      _dio({'GET /api/grades/years': 'grade_years'}),
    ).getYears('q-st');
    expect(y.years, contains('2025/2026'));
    expect(y.current, isNotEmpty);
  });

  test('disciplinas e turmas do encarregado', () async {
    final subjects = await SubjectRepository(
      _dio({'GET /api/subjects': 'subjects_parent'}),
    ).getSubjects();
    expect(subjects.single.classIds, ['q-c10']);
    final classes = await ClassRepository(
      _dio({'GET /api/classes': 'classes_parent'}),
    ).getClasses();
    expect(classes.single.className, '10ª Classe');
    // Sem propinas na resposta ao encarregado: o modelo aguenta a falta.
    expect(_fixture('classes_parent')['data'][0], isNot(contains('fee_amount')));
    expect(classes.single.feeAmount, 0);
  });

  test('professores (admin)', () async {
    final teachers = await UserRepository(
      _dio({'GET /api/users/teachers': 'teachers'}),
    ).getTeachers();
    expect(teachers.single.name, 'Carlos Mendes');
    expect(teachers.single.subjectsText, 'Matemática');
  });

  test('comunicados: público de turma e por ler', () async {
    final repo = NoticesRepository(_dio({
      'GET /api/notices': 'notices_parent',
      'GET /api/notices/unread-count': 'notices_unread',
    }));
    final list = await repo.listNotices();
    final n = list.single;
    expect(n.audience, 'class');
    expect(n.className, '10ª Classe');
    expect(n.audienceLabel, 'Encarregados da 10ª Classe');
    expect(n.category, 'event');
    expect(n.isRead, isFalse);
    expect(await repo.getUnreadCount(), 1);
  });

  test('conversas: lista, por ler, contactos e mensagens', () async {
    final routes = {
      'GET /api/conversations': 'conversations',
      'GET /api/conversations/unread-count': 'conversations_unread',
      'GET /api/conversations/contacts': 'conversation_contacts',
    };
    final list = _fixture('conversations')['data'] as List;
    final id = (list.single as Map)['id'] as String;
    routes['GET /api/conversations/$id/messages'] = 'conversation_messages';
    final repo = ConversationsRepository(_dio(routes));

    final convs = await repo.list();
    expect(convs.single.otherName, 'Mariana Silva');
    expect(convs.single.unread, 1);
    expect(await repo.unreadCount(), 1);

    final contacts = await repo.contacts();
    final parent = contacts.firstWhere((c) => c.role == 'parent');
    expect(parent.wards, 'Ana Silva');
    expect(
      contactRoleLabel(parent.role, wards: parent.wards),
      'Encarregado de Ana Silva',
    );

    final thread = await repo.thread(id);
    expect(thread.otherName, 'Mariana Silva');
    expect(thread.messages.single.body, 'Bom dia, professor.');
    expect(thread.messages.single.mine, isFalse);
    expect(thread.hasMore, isFalse);
    // A data vem do servidor em UTC, sem "T" nem "Z": o app tem de a ler.
    expect(
      DateTime.tryParse('${thread.messages.single.createdAt.replaceFirst(' ', 'T')}Z'),
      isNotNull,
    );
  });
}
