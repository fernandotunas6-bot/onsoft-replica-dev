import 'dart:convert';
import 'package:http/http.dart' as http;

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
    if (user.isEmpty || school.isEmpty || !{'aluno', 'professor'}.contains(selectedRole)) {
      throw StateError('Contexto institucional inválido.');
    }
    reset();
    userId = user;
    schoolId = school;
    role = selectedRole;
  }

  Future<Map<String, dynamic>> session() => _get('/session');

  Future<Map<String, dynamic>> read(String collection) async {
    if (!{'academic', 'notifications', 'chat'}.contains(collection) ||
        schoolId == null || role == null) {
      throw StateError('Seleccione uma escola e um perfil.');
    }
    final expectedSchool = schoolId;
    final expectedRole = role;
    final expectedUser = userId;
    final result = await _get('/schools/${Uri.encodeComponent(expectedSchool!)}'
        '/$collection?role=${Uri.encodeComponent(expectedRole!)}');
    if (result['schoolId'] != expectedSchool || result['role'] != expectedRole ||
        (collection != 'academic' && result['userId'] != expectedUser)) {
      throw StateError('Resposta fora do contexto autorizado.');
    }
    return result;
  }

  Future<Map<String, dynamic>> _get(String path) async {
    final revision = _revision;
    final access = await token();
    if (revision != _revision) throw StateError('A sessão mudou.');
    if (access == null) throw StateError('Volte a entrar na sua conta.');
    final response = await client.get(origin.resolve('/api/mobile-v4$path'), headers: {
      'Authorization': 'Bearer $access',
      'Accept': 'application/json',
      'Cache-Control': 'no-store',
    }).timeout(const Duration(seconds: 20));
    if (revision != _revision) throw StateError('A sessão ou escola mudou.');
    if (response.statusCode != 200) {
      throw StateError(response.statusCode == 401
          ? 'Sessão expirada. Volte a entrar.'
          : response.statusCode == 403
              ? 'Sem autorização para esta escola.'
              : 'Não foi possível carregar os dados (${response.statusCode}).');
    }
    final result = jsonDecode(response.body);
    if (result is! Map<String, dynamic>) throw StateError('Resposta inválida.');
    return result;
  }
  void dispose() => client.close();
}
