import 'dart:convert';
import 'dart:math';
import 'package:http/http.dart' as http;

/// Servidor da API móvel. No browser é a própria origem da página; nas apps
/// nativas (Android/iOS) não há origem, e o servidor vem de
/// `--dart-define=SIGA_API_ORIGIN=https://…`. Só HTTPS; sem servidor válido
/// devolve null e a app mostra que aguarda configuração.
Uri? resolveApiOrigin(
  String configured, {
  required bool web,
  required Uri base,
}) {
  if (configured.isNotEmpty) {
    final uri = Uri.tryParse(configured);
    if (uri == null || uri.scheme != 'https' || uri.host.isEmpty) return null;
    return Uri(
      scheme: 'https',
      host: uri.host,
      port: uri.hasPort ? uri.port : null,
    );
  }
  return web ? base : null;
}

/// Erro devolvido pelo servidor numa escrita: o código (`{"error":…}`) e a
/// mensagem em português para mostrar.
class CommandError implements Exception {
  const CommandError(this.code, this.message);
  final String code;
  final String message;
  @override
  String toString() => message;
}

/// Mensagens dos códigos de erro das escritas Mobile V4.
const commandMessages = {
  'MFA_REQUIRED':
      'Esta acção exige a verificação em dois passos. Active-a no portal '
      'SIGA e volte a entrar.',
  'SESSION_REQUIRED': 'Sessão expirada. Volte a entrar.',
  'MODULE_FORBIDDEN':
      'O seu acesso a este módulo é só de leitura ou a escola está '
      'suspensa.',
  'ROLE_FORBIDDEN': 'Este perfil não pode fazer esta acção.',
  'COMMAND_ROLE_FORBIDDEN': 'Este perfil não pode fazer esta acção.',
  'SCHOOL_FORBIDDEN': 'Sem autorização para esta escola.',
  'CLASS_FORBIDDEN': 'Esta disciplina não está atribuída a si.',
  'ATTENDANCE_FUTURE_DATE': 'Não é possível marcar presenças no futuro.',
  'ATTENDANCE_STUDENT_NOT_ENROLLED':
      'Um dos alunos já não está matriculado nesta turma.',
  'ATTENDANCE_ROSTER_CHANGED':
      'A lista de alunos mudou. Volte a abrir a chamada.',
  'ATTENDANCE_SESSION_AMBIGUOUS':
      'Há mais de uma aula neste dia. Faça a chamada no portal.',
  'ATTENDANCE_SESSION_CANCELLED': 'A aula deste dia foi cancelada.',
  'ATTENDANCE_PERIOD_LOCKED':
      'O período já tem folha oficial; as presenças estão fechadas.',
  'ATTENDANCE_ALREADY_CLOSED':
      'A chamada de hoje já foi fechada. Correcções fazem-se no portal.',
  'ATTENDANCE_NOT_CLOSED':
      'As presenças foram gravadas mas a chamada não fechou. Tente de novo.',
  'CHAT_FORBIDDEN': 'Não pode escrever nesta conversa.',
  'CHAT_VALIDATION_FAILED': 'Mensagem inválida.',
  'CHAT_WRITES_NOT_READY':
      'O envio de mensagens ainda não está activo no servidor da escola.',
  'IDEMPOTENCY_CONFLICT': 'Pedido repetido com conteúdo diferente.',
};

/// Identificador aleatório (UUID v4) para tornar um envio idempotente.
String newRequestId() {
  final random = Random.secure();
  final bytes = List<int>.generate(16, (_) => random.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-'
      '${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
}

/// Transport only. The existing Mobile V4 server owns authorization and rules.
class MobileGateway {
  MobileGateway(this.origin, this.token, {http.Client? client})
    : client = client ?? http.Client();
  final Uri origin;
  final Future<String?> Function() token;
  final http.Client client;
  int _revision = 0;
  String? schoolId;
  String? role;
  String? userId;

  void reset() {
    _revision++;
    schoolId = role = userId = null;
  }

  void select(String user, String school, String selectedRole) {
    if (user.isEmpty ||
        school.isEmpty ||
        !{'aluno', 'professor'}.contains(selectedRole)) {
      throw StateError('Contexto institucional inválido.');
    }
    reset();
    userId = user;
    schoolId = school;
    role = selectedRole;
  }

  Future<Map<String, dynamic>> session() => _get('/session');

  Future<Map<String, dynamic>> read(String collection) async {
    if (!{
          'academic',
          'notifications',
          'chat',
          'finance',
          'documents',
          'results',
          'gradebooks',
          'lesson-plans',
        }.contains(collection) ||
        schoolId == null ||
        role == null) {
      throw StateError('Seleccione uma escola e um perfil.');
    }
    if ({'finance', 'documents', 'results'}.contains(collection) &&
        role != 'aluno') {
      throw StateError('Esta consulta é exclusiva do aluno.');
    }
    if ({'gradebooks', 'lesson-plans'}.contains(collection) &&
        role != 'professor') {
      throw StateError('Esta consulta é exclusiva do professor.');
    }
    final expectedSchool = schoolId;
    final expectedRole = role;
    final expectedUser = userId;
    final result = await _get(
      '/schools/${Uri.encodeComponent(expectedSchool!)}'
      '/$collection?role=${Uri.encodeComponent(expectedRole!)}',
    );
    if (result['schoolId'] != expectedSchool ||
        result['role'] != expectedRole ||
        (!{
              'academic',
              'results',
              'gradebooks',
              'lesson-plans',
            }.contains(collection) &&
            result['userId'] != expectedUser)) {
      throw StateError('Resposta fora do contexto autorizado.');
    }
    return result;
  }

  Future<Map<String, dynamic>> chatHistory(
    String conversationId, {
    Map<String, dynamic>? before,
  }) async {
    if (schoolId == null || role == null || userId == null) {
      throw StateError('Seleccione uma escola.');
    }
    final school = schoolId;
    final profile = role;
    final user = userId;
    final query = <String, String>{
      'role': profile!,
      'conversationId': conversationId,
    };
    if (before != null) {
      if (before['date'] is! String || before['id'] is! String) {
        throw StateError('Cursor inválido.');
      }
      query['before'] = before['date'] as String;
      query['beforeId'] = before['id'] as String;
    }
    final result = await _get(
      '/schools/${Uri.encodeComponent(school!)}/chat?${Uri(queryParameters: query).query}',
    );
    if (result['schoolId'] != school ||
        result['role'] != profile ||
        result['userId'] != user ||
        result['conversationId'] != conversationId ||
        result['messages'] is! List) {
      throw StateError('Histórico fora do contexto autorizado.');
    }
    return result;
  }

  /// Avisos anteriores ao cursor `{date, id}` devolvido em `next`.
  Future<Map<String, dynamic>> olderNotices(Map<String, dynamic> before) async {
    final school = _school();
    final expectedRole = role;
    if (before['date'] is! String || before['id'] is! String) {
      throw StateError('Cursor inválido.');
    }
    final query = Uri(
      queryParameters: {
        'role': expectedRole!,
        'before': before['date'] as String,
        'beforeId': before['id'] as String,
      },
    ).query;
    final result = await _get('/schools/$school/notifications?$query');
    if (result['schoolId'] != schoolId ||
        result['role'] != expectedRole ||
        result['userId'] != userId ||
        result['items'] is! List) {
      throw StateError('Resposta fora do contexto autorizado.');
    }
    return result;
  }

  /// O servidor aceita envio de mensagens? (RPC activa no SIGA).
  Future<bool> chatWrites() async {
    final school = _school();
    final result = await _get(
      '/schools/$school/chat-capabilities?role=${Uri.encodeComponent(role!)}',
    );
    return result['writes'] == true;
  }

  /// Presenças de um dia (sessões e registos), para saber se a chamada de
  /// uma disciplina já foi feita ou fechada.
  Future<Map<String, dynamic>> attendanceOn(String date) =>
      attendanceBetween(date, date);

  /// Presenças entre duas datas (AAAA-MM-DD, no máximo 31 dias, regra do
  /// servidor): sessões com os registos e, para o professor, as aulas dadas.
  Future<Map<String, dynamic>> attendanceBetween(String from, String to) async {
    final school = _school();
    final expectedRole = role;
    final result = await _get(
      '/schools/$school/attendance?role=${Uri.encodeComponent(expectedRole!)}'
      '&from=$from&to=$to',
    );
    if (result['schoolId'] != schoolId ||
        result['role'] != expectedRole ||
        result['sessions'] is! List) {
      throw StateError('Resposta fora do contexto autorizado.');
    }
    return result;
  }

  /// Marca avisos como lidos no SIGA (todos, ou os [ids] indicados).
  Future<Map<String, dynamic>> markNoticesRead({List<String>? ids}) => _post(
    'notifications-read',
    {if (ids == null) 'all': true else 'ids': ids},
  );

  /// Chamada do professor: grava as presenças da disciplina no dia e fecha a
  /// sessão, nas mesmas tabelas do portal.
  Future<Map<String, dynamic>> submitAttendance({
    required String classSubjectId,
    required String date,
    required Map<String, String> statusByStudent,
  }) => _post('attendance-call', {
    'classSubjectId': classSubjectId,
    'date': date,
    'records': [
      for (final entry in statusByStudent.entries)
        {'studentId': entry.key, 'status': entry.value},
    ],
  });

  /// Comandos de conversa (enviar, ler, apagar, iniciar), idempotentes pelo
  /// [requestId]: repetir o mesmo pedido não duplica a mensagem.
  Future<Map<String, dynamic>> chatCommand(
    Map<String, dynamic> command, {
    String? requestId,
  }) => _post('chat-commands', {
    'requestId': requestId ?? newRequestId(),
    'command': command,
  });

  String _school() {
    if (schoolId == null || role == null) {
      throw StateError('Seleccione uma escola e um perfil.');
    }
    return Uri.encodeComponent(schoolId!);
  }

  Future<Map<String, dynamic>> _post(
    String operation,
    Map<String, dynamic> body,
  ) async {
    final school = _school();
    final revision = _revision;
    final access = await token();
    if (revision != _revision) throw StateError('A sessão mudou.');
    if (access == null) throw StateError('Volte a entrar na sua conta.');
    final response = await client
        .post(
          origin.resolve('/api/mobile-v4/schools/$school/$operation'),
          headers: {
            'Authorization': 'Bearer $access',
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          body: jsonEncode({'role': role, ...body}),
        )
        .timeout(const Duration(seconds: 20));
    if (revision != _revision) throw StateError('A sessão ou escola mudou.');
    dynamic decoded;
    try {
      decoded = response.body.isEmpty ? null : jsonDecode(response.body);
    } on FormatException {
      decoded = null;
    }
    if (response.statusCode != 200) {
      final code = decoded is Map && decoded['error'] is String
          ? decoded['error'] as String
          : 'HTTP_${response.statusCode}';
      throw CommandError(
        code,
        commandMessages[code] ??
            'Não foi possível gravar no SIGA ($code). Tente de novo.',
      );
    }
    // Comandos de conversa respondem só {type, conversationId, messageId};
    // os restantes trazem a escola, que tem de ser a escolhida.
    if (decoded is! Map<String, dynamic> ||
        (decoded.containsKey('schoolId') && decoded['schoolId'] != schoolId)) {
      throw StateError('Resposta fora do contexto autorizado.');
    }
    return decoded;
  }

  Future<Map<String, dynamic>> _get(String path) async {
    final revision = _revision;
    final access = await token();
    if (revision != _revision) throw StateError('A sessão mudou.');
    if (access == null) throw StateError('Volte a entrar na sua conta.');
    final response = await client
        .get(
          origin.resolve('/api/mobile-v4$path'),
          headers: {
            'Authorization': 'Bearer $access',
            'Accept': 'application/json',
            'Cache-Control': 'no-store',
          },
        )
        .timeout(const Duration(seconds: 20));
    if (revision != _revision) throw StateError('A sessão ou escola mudou.');
    if (response.statusCode != 200) {
      throw StateError(
        response.statusCode == 401
            ? 'Sessão expirada. Volte a entrar.'
            : response.statusCode == 403
            ? 'Sem autorização para esta escola.'
            : 'Não foi possível carregar os dados (${response.statusCode}).',
      );
    }
    final result = jsonDecode(response.body);
    if (result is! Map<String, dynamic>) throw StateError('Resposta inválida.');
    return result;
  }

  void dispose() => client.close();
}
