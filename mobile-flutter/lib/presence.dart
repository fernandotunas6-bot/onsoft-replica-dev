import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

/// Presença do professor pelo QR da escola.
///
/// A Direcção mostra um QR único para todos os professores (muda a cada 30 s e
/// funciona sem internet no ecrã dela). O professor lê-o aqui antes da aula. O
/// servidor confirma a assinatura, a hora e a zona da escola; a app só envia o
/// texto do QR, a localização e a hora do telemóvel.
const schoolQrPrefix = 'SIGAP1.';

bool isSchoolQr(String? value) =>
    value != null &&
    value.startsWith(schoolQrPrefix) &&
    value.split('.').length == 5;

enum PresenceMode { qr, button, off }

PresenceMode presenceModeOf(Object? value) => switch (value) {
  'qr' => PresenceMode.qr,
  'off' => PresenceMode.off,
  _ => PresenceMode.button,
};

class PresenceLesson {
  const PresenceLesson({
    required this.sessionId,
    required this.className,
    required this.subjectName,
    required this.startsAt,
    required this.endsAt,
    required this.status,
    this.room,
    this.checkedInAt,
    this.method,
    this.lateMinutes,
  });

  final String sessionId;
  final String className;
  final String subjectName;
  final String? room;
  final String? startsAt;
  final String? endsAt;
  final String status;
  final DateTime? checkedInAt;
  final String? method;
  final int? lateMinutes;

  bool get confirmed => checkedInAt != null;
  bool get cancelled => status == 'cancelled';

  String get timeRange {
    final start = (startsAt ?? '').padRight(5).substring(0, 5).trim();
    final end = (endsAt ?? '').padRight(5).substring(0, 5).trim();
    if (start.isEmpty) return 'Sem hora';
    return end.isEmpty ? start : '$start–$end';
  }

  static PresenceLesson fromJson(Map<String, dynamic> json) {
    final presence = json['presence'] is Map
        ? Map<String, dynamic>.from(json['presence'] as Map)
        : const <String, dynamic>{};
    final checked = presence['teacher_checked_in_at'];
    return PresenceLesson(
      sessionId: '${json['sessionId']}',
      className: '${json['classGroupName'] ?? 'Turma'}',
      subjectName: '${json['subjectName'] ?? 'Disciplina'}',
      room: json['room'] as String?,
      startsAt: json['startsAt'] as String?,
      endsAt: json['endsAt'] as String?,
      status: '${json['status'] ?? 'pending'}',
      checkedInAt: checked is String ? DateTime.tryParse(checked) : null,
      method: presence['teacher_checkin_method'] as String?,
      lateMinutes: (presence['teacher_late_minutes'] as num?)?.toInt(),
    );
  }
}

class PresenceToday {
  const PresenceToday({
    required this.mode,
    required this.date,
    required this.lessons,
    required this.clockOffset,
  });
  final PresenceMode mode;
  final String date;
  final List<PresenceLesson> lessons;

  /// Diferença entre o relógio do servidor e o do telemóvel.
  final Duration clockOffset;
}

enum ScanDecision { accepted, review, rejected }

class ScanResult {
  const ScanResult({
    required this.decision,
    required this.message,
    required this.lessons,
    this.reasons = const [],
  });
  final ScanDecision decision;
  final String message;
  final List<String> lessons;
  final List<String> reasons;

  static ScanResult fromJson(Map<String, dynamic> json) => ScanResult(
    decision: switch (json['decision']) {
      'accepted' => ScanDecision.accepted,
      'review' => ScanDecision.review,
      _ => ScanDecision.rejected,
    },
    message: '${json['message'] ?? ''}',
    reasons: [
      for (final r in (json['reasonLabels'] as List? ?? const [])) '$r',
    ],
    lessons: [
      for (final l in (json['lessons'] as List? ?? const []))
        if (l is Map) '${l['label']}',
    ],
  );
}

/// Leitura feita no telemóvel, enviada já ou guardada para quando houver rede.
class PendingScan {
  const PendingScan({
    required this.opId,
    required this.schoolId,
    required this.token,
    required this.deviceScannedAt,
    this.latitude,
    this.longitude,
    this.accuracy,
    this.mocked,
  });
  final String opId;
  final String schoolId;
  final String token;
  final DateTime deviceScannedAt;
  final double? latitude;
  final double? longitude;
  final double? accuracy;
  final bool? mocked;

  Map<String, dynamic> toJson() => {
    'opId': opId,
    'schoolId': schoolId,
    'token': token,
    'deviceScannedAt': deviceScannedAt.toUtc().toIso8601String(),
    'latitude': latitude,
    'longitude': longitude,
    'accuracy': accuracy,
    'mocked': mocked,
  };

  static PendingScan? fromJson(Object? raw) {
    if (raw is! Map) return null;
    final at = DateTime.tryParse('${raw['deviceScannedAt']}');
    if (raw['opId'] is! String ||
        raw['schoolId'] is! String ||
        raw['token'] is! String ||
        at == null) {
      return null;
    }
    return PendingScan(
      opId: raw['opId'] as String,
      schoolId: raw['schoolId'] as String,
      token: raw['token'] as String,
      deviceScannedAt: at,
      latitude: (raw['latitude'] as num?)?.toDouble(),
      longitude: (raw['longitude'] as num?)?.toDouble(),
      accuracy: (raw['accuracy'] as num?)?.toDouble(),
      mocked: raw['mocked'] as bool?,
    );
  }
}

/// Sem rede (zonas remotas): a leitura fica guardada no telemóvel e segue depois.
class PresenceQueue {
  PresenceQueue(this.prefs);
  final SharedPreferences prefs;
  static const _key = 'presence-queue-v1';
  static const _max = 50;

  List<PendingScan> read() {
    try {
      final raw = jsonDecode(prefs.getString(_key) ?? '[]');
      if (raw is! List) return [];
      return [for (final item in raw) ?PendingScan.fromJson(item)];
    } catch (_) {
      return [];
    }
  }

  Future<void> _write(List<PendingScan> items) => prefs.setString(
    _key,
    jsonEncode([
      for (final item
          in items.length > _max ? items.sublist(items.length - _max) : items)
        item.toJson(),
    ]),
  );

  Future<void> add(PendingScan scan) =>
      _write([...read().where((s) => s.opId != scan.opId), scan]);

  Future<void> remove(String opId) =>
      _write(read().where((s) => s.opId != opId).toList());

  static const _deviceKey = 'presence-device-v1';

  /// Id aleatório deste telemóvel, criado uma vez e guardado nele. Não diz quem é
  /// a pessoa: só mostra à Direcção quando contas de professores diferentes lêem
  /// o QR no mesmo aparelho (um colega a marcar por quem faltou).
  Future<String> deviceId() async {
    final saved = prefs.getString(_deviceKey);
    if (saved != null && RegExp(r'^[A-Za-z0-9_-]{8,128}$').hasMatch(saved)) {
      return saved;
    }
    final created = newOpId();
    await prefs.setString(_deviceKey, created);
    return created;
  }
}

/// Falha de rede (guardar e tentar depois) ou recusa do servidor (mostrar).
class PresenceFailure implements Exception {
  const PresenceFailure(this.message, {this.network = false});
  final String message;
  final bool network;
  @override
  String toString() => message;
}

class PresenceApi {
  PresenceApi(this.origin, this.token, {http.Client? client})
    : client = client ?? http.Client();
  final Uri origin;
  final Future<String?> Function() token;
  final http.Client client;

  Future<Map<String, String>> _headers() async {
    final access = await token();
    if (access == null) {
      throw const PresenceFailure('Volte a entrar na sua conta.');
    }
    return {
      'Authorization': 'Bearer $access',
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    };
  }

  Future<Map<String, dynamic>> _send(
    Future<http.Response> Function(Map<String, String> headers) call,
  ) async {
    final headers = await _headers();
    http.Response response;
    try {
      response = await call(headers).timeout(const Duration(seconds: 20));
    } on TimeoutException {
      throw const PresenceFailure('Sem resposta do servidor.', network: true);
    } catch (_) {
      throw const PresenceFailure('Sem ligação à internet.', network: true);
    }
    Object? body;
    try {
      body = jsonDecode(response.body);
    } catch (_) {
      body = null;
    }
    if (response.statusCode >= 500) {
      throw const PresenceFailure(
        'O servidor está indisponível.',
        network: true,
      );
    }
    if (response.statusCode != 200 || body is! Map<String, dynamic>) {
      final message = body is Map && body['error'] is String
          ? body['error'] as String
          : 'Pedido recusado (${response.statusCode}).';
      throw PresenceFailure(message);
    }
    return body;
  }

  Future<PresenceToday> today(String schoolId) async {
    final sentAt = DateTime.now();
    final json = await _send(
      (headers) => client.get(
        origin.resolve(
          '/api/mobile/presence?schoolId=${Uri.encodeQueryComponent(schoolId)}',
        ),
        headers: headers,
      ),
    );
    if (json['schoolId'] != schoolId) {
      throw const PresenceFailure('Resposta fora do contexto autorizado.');
    }
    final serverNow = (json['serverNow'] as num?)?.toInt();
    final roundTrip = DateTime.now().difference(sentAt);
    return PresenceToday(
      mode: presenceModeOf(json['mode']),
      date: '${json['date'] ?? ''}',
      clockOffset: serverNow == null
          ? Duration.zero
          : Duration(
              milliseconds:
                  serverNow +
                  roundTrip.inMilliseconds ~/ 2 -
                  DateTime.now().millisecondsSinceEpoch,
            ),
      lessons: [
        for (final l in (json['lessons'] as List? ?? const []))
          if (l is Map) PresenceLesson.fromJson(Map<String, dynamic>.from(l)),
      ],
    );
  }

  Future<ScanResult> submit(
    PendingScan scan, {
    required bool offline,
    String? deviceId,
  }) async {
    final json = await _send(
      (headers) => client.post(
        origin.resolve('/api/mobile/presence'),
        headers: headers,
        body: jsonEncode({
          ...scan.toJson(),
          'offline': offline,
          'deviceNow': DateTime.now().toUtc().toIso8601String(),
          'deviceId': ?deviceId,
        }),
      ),
    );
    return ScanResult.fromJson(json);
  }

  void dispose() => client.close();
}

/// Envia a fila guardada. Pára no primeiro erro de rede; uma recusa do servidor
/// (QR anulado, outra escola) sai da fila para não repetir para sempre.
Future<({int sent, List<String> refused})> flushPresenceQueue(
  PresenceApi api,
  PresenceQueue queue,
) async {
  var sent = 0;
  final refused = <String>[];
  final deviceId = await queue.deviceId();
  for (final scan in queue.read()) {
    try {
      await api.submit(scan, offline: true, deviceId: deviceId);
      await queue.remove(scan.opId);
      sent++;
    } on PresenceFailure catch (failure) {
      if (failure.network) break;
      await queue.remove(scan.opId);
      refused.add(failure.message);
    }
  }
  return (sent: sent, refused: refused);
}

/// "3" → "Sala 3"; nomes que já dizem o que são ("Sala 3", "Laboratório") ficam.
String roomLabel(String room) {
  final value = room.trim();
  return RegExp(r'^\d+[A-Za-z]?$').hasMatch(value) ? 'Sala $value' : value;
}

/// UUID v4 para identificar o envio (o servidor ignora repetições).
String newOpId([Random? random]) {
  final r = random ?? Random.secure();
  final bytes = List<int>.generate(16, (_) => r.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-'
      '${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
}
