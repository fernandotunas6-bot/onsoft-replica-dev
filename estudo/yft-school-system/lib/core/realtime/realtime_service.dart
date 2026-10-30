import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:realtime_client/realtime_client.dart';

import '../sga/sga_config.dart';

/// O que chegou ao segundo pelo tempo real do SIGA.
enum LiveKind {
  /// Aviso pessoal novo (`notifications`, só os da própria conta).
  notice,

  /// Mensagem nova numa conversa de que a conta faz parte.
  chat,

  /// Comunicado acabado de publicar para o público da conta.
  announcement,
}

class LiveEvent {
  final LiveKind kind;
  final Map<String, dynamic> record;
  const LiveEvent(this.kind, this.record);
}

/// Comunicado que merece aviso: enviado, não apagado, publicado há menos de dez
/// minutos e não escrito pela própria conta (a mesma regra do desktop).
bool isFreshAnnouncement(
  Map<String, dynamic> row, {
  required String userId,
  required DateTime now,
}) {
  if (row['id'] is! String || row['deleted_at'] != null) return false;
  if (row['status'] != 'sent') return false;
  if (row['created_by'] == userId) return false;
  final published = DateTime.tryParse(row['published_at'] as String? ?? '');
  if (published == null) return false;
  return now.difference(published).inMinutes.abs() <= 10;
}

/// Ligação ao tempo real do Supabase do SIGA, com a app aberta.
///
/// Três canais, um por tabela, para que uma falha não leve as outras:
/// `notifications` (filtro `user_id`; precisa da migração
/// 20261027100000_realtime_publish_notifications), `siga_chat_messages` e
/// `school_announcements` (já publicadas). O servidor aplica o RLS de cada
/// tabela: cada conta só recebe o que pode ler pela API.
class SgaRealtime {
  final SgaConfig config;
  final Future<String?> Function() token;
  final RealtimeClient Function(String endpoint, Map<String, String> params)?
  _clientFactory;

  SgaRealtime({
    required this.config,
    required this.token,
    RealtimeClient Function(String endpoint, Map<String, String> params)?
    clientFactory,
  }) : _clientFactory = clientFactory;

  RealtimeClient? _client;
  final _channels = <RealtimeChannel>[];
  final _events = StreamController<LiveEvent>.broadcast();
  final _announced = <String>{};
  String? _userId;
  String? _schoolId;

  Stream<LiveEvent> get events => _events.stream;

  /// Os avisos pessoais chegam ao segundo (a publicação existe e o canal
  /// entrou). Desligado: a app verifica-os de minuto a minuto.
  final noticesLive = ValueNotifier<bool>(false);

  /// As mensagens chegam ao segundo.
  final chatLive = ValueNotifier<bool>(false);

  bool get running => _client != null;

  /// `wss://<projecto>.supabase.co/realtime/v1`
  static String endpointFor(String supabaseUrl) =>
      '${supabaseUrl.replaceAll(RegExp(r'/+$'), '').replaceFirst(RegExp(r'^http', caseSensitive: false), 'ws')}/realtime/v1';

  Future<void> start({required String userId, required String schoolId}) async {
    if (!config.enabled || userId.isEmpty) return;
    if (_client != null && _userId == userId && _schoolId == schoolId) {
      await refreshAuth();
      return;
    }
    await stop();
    _userId = userId;
    _schoolId = schoolId;
    final endpoint = endpointFor(config.supabaseUrl);
    final params = {'apikey': config.publishableKey};
    final client =
        _clientFactory?.call(endpoint, params) ??
        RealtimeClient(
          endpoint,
          params: params,
          customAccessToken: token,
          logLevel: RealtimeLogLevel.error,
        );
    _client = client;
    await client.setAuth(await token());

    _listen(
      client,
      topic: 'mobile-notices:$userId',
      table: 'notifications',
      event: PostgresChangeEvent.insert,
      filter: PostgresChangeFilter(
        type: PostgresChangeFilterType.eq,
        column: 'user_id',
        value: userId,
      ),
      live: noticesLive,
      onRow: (row) => _events.add(LiveEvent(LiveKind.notice, row)),
    );
    _listen(
      client,
      topic: 'mobile-chat:$userId',
      table: 'siga_chat_messages',
      event: PostgresChangeEvent.insert,
      live: chatLive,
      onRow: (row) {
        if (row['sender_id'] == userId) return;
        _events.add(LiveEvent(LiveKind.chat, row));
      },
    );
    _listen(
      client,
      topic: 'mobile-announcements:$schoolId',
      table: 'school_announcements',
      event: PostgresChangeEvent.all,
      filter: PostgresChangeFilter(
        type: PostgresChangeFilterType.eq,
        column: 'school_id',
        value: schoolId,
      ),
      onRow: (row) {
        if (!isFreshAnnouncement(row, userId: userId, now: DateTime.now())) {
          return;
        }
        // Publicar e depois editar chega como dois eventos: avisa uma vez.
        if (!_announced.add(row['id'] as String)) return;
        _events.add(LiveEvent(LiveKind.announcement, row));
      },
    );
  }

  void _listen(
    RealtimeClient client, {
    required String topic,
    required String table,
    required PostgresChangeEvent event,
    PostgresChangeFilter? filter,
    ValueNotifier<bool>? live,
    required void Function(Map<String, dynamic> row) onRow,
  }) {
    final channel = client.channel(topic);
    channel.onPostgresChanges(
      event: event,
      schema: 'public',
      table: table,
      filter: filter,
      callback: (payload) {
        final row = payload.newRecord;
        if (row.isNotEmpty) onRow(row);
      },
    );
    channel.subscribe((status, error) {
      switch (status) {
        case RealtimeSubscribeStatus.subscribed:
          live?.value = true;
        case RealtimeSubscribeStatus.channelError:
        case RealtimeSubscribeStatus.timedOut:
          live?.value = false;
          if (kDebugMode) debugPrint('[tempo real] $table: $status $error');
          // Tabela por publicar (ou sem acesso): não insistir de segundos em
          // segundos; a app verifica de minuto a minuto.
          if (_channels.remove(channel)) {
            unawaited(client.removeChannel(channel));
          }
        case RealtimeSubscribeStatus.closed:
          live?.value = false;
      }
    });
    _channels.add(channel);
  }

  /// O token de acesso dura uma hora: renovar antes de o servidor fechar.
  Future<void> refreshAuth() async {
    final client = _client;
    if (client == null) return;
    try {
      await client.setAuth(await token());
    } catch (_) {}
  }

  Future<void> stop() async {
    final client = _client;
    _client = null;
    _userId = null;
    _schoolId = null;
    noticesLive.value = false;
    chatLive.value = false;
    _channels.clear();
    if (client == null) return;
    try {
      await client.removeAllChannels();
      await client.disconnect();
    } catch (_) {}
  }
}
