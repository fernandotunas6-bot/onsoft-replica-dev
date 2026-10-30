import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

/// O que a app guarda sobre os avisos neste telemóvel: as escolhas da pessoa
/// (notificações no telemóvel, lembretes da véspera) e as marcas do que já foi
/// avisado, para nunca avisar duas vezes o mesmo. A app e a verificação em
/// segundo plano lêem e escrevem o mesmo ficheiro.
class NotifyState {
  /// Conta dona das marcas; outra conta no mesmo telemóvel começa do zero.
  final String? uid;

  /// Papel da conta (`parent`, `teacher`, `admin`) e se é aluno: a verificação
  /// em segundo plano escolhe por eles o destino dos avisos e os lembretes.
  final String? role;
  final bool student;

  /// Notificações no telemóvel (com a app em segundo plano ou fechada).
  final bool phoneEnabled;

  /// Lembretes da véspera: avaliação ou trabalho para amanhã.
  final bool reminders;

  /// O cartão «Receber avisos no telemóvel» foi fechado.
  final bool promptDismissed;

  /// Comunicados vistos até esta data (o SIGA não guarda a leitura por pessoa).
  final DateTime? seenAnnouncementsAt;

  /// Aviso pessoal mais recente já mostrado (no ecrã ou no telemóvel).
  final DateTime? lastNoticeAt;

  /// Os últimos avisos já mostrados (ids), para não repetir.
  final List<String> surfacedIds;

  /// Mensagens por ler na última verificação.
  final int chatUnread;

  /// Comunicado mais recente já avisado no telemóvel.
  final DateTime? lastAnnouncementAt;

  /// Dia (aaaa-mm-dd) dos últimos lembretes da véspera.
  final String? reminderDay;

  const NotifyState({
    this.uid,
    this.role,
    this.student = false,
    this.phoneEnabled = true,
    this.reminders = true,
    this.promptDismissed = false,
    this.seenAnnouncementsAt,
    this.lastNoticeAt,
    this.surfacedIds = const [],
    this.chatUnread = 0,
    this.lastAnnouncementAt,
    this.reminderDay,
  });

  static const _maxIds = 60;

  /// As marcas desta conta; as escolhas do telemóvel ficam.
  NotifyState forUser(String uid) => uid == this.uid
      ? this
      : NotifyState(
          uid: uid,
          phoneEnabled: phoneEnabled,
          reminders: reminders,
          promptDismissed: promptDismissed,
        );

  NotifyState copyWith({
    String? role,
    bool? student,
    bool? phoneEnabled,
    bool? reminders,
    bool? promptDismissed,
    DateTime? seenAnnouncementsAt,
    DateTime? lastNoticeAt,
    List<String>? surfacedIds,
    int? chatUnread,
    DateTime? lastAnnouncementAt,
    String? reminderDay,
  }) => NotifyState(
    uid: uid,
    role: role ?? this.role,
    student: student ?? this.student,
    phoneEnabled: phoneEnabled ?? this.phoneEnabled,
    reminders: reminders ?? this.reminders,
    promptDismissed: promptDismissed ?? this.promptDismissed,
    seenAnnouncementsAt: seenAnnouncementsAt ?? this.seenAnnouncementsAt,
    lastNoticeAt: lastNoticeAt ?? this.lastNoticeAt,
    surfacedIds: surfacedIds ?? this.surfacedIds,
    chatUnread: chatUnread ?? this.chatUnread,
    lastAnnouncementAt: lastAnnouncementAt ?? this.lastAnnouncementAt,
    reminderDay: reminderDay ?? this.reminderDay,
  );

  /// Marca avisos como mostrados (os mais recentes ficam no fim).
  NotifyState surfaced(Iterable<String> ids, DateTime newest) {
    final all = [...surfacedIds.where((i) => !ids.contains(i)), ...ids];
    final last = lastNoticeAt;
    return copyWith(
      surfacedIds: all.length > _maxIds
          ? all.sublist(all.length - _maxIds)
          : all,
      lastNoticeAt: last == null || newest.isAfter(last) ? newest : last,
    );
  }

  bool wasSurfaced(String id) => surfacedIds.contains(id);

  Map<String, dynamic> toJson() => {
    'uid': uid,
    'role': role,
    'student': student,
    'phoneEnabled': phoneEnabled,
    'reminders': reminders,
    'promptDismissed': promptDismissed,
    'seenAnnouncementsAt': seenAnnouncementsAt?.toUtc().toIso8601String(),
    'lastNoticeAt': lastNoticeAt?.toUtc().toIso8601String(),
    'surfacedIds': surfacedIds,
    'chatUnread': chatUnread,
    'lastAnnouncementAt': lastAnnouncementAt?.toUtc().toIso8601String(),
    'reminderDay': reminderDay,
  };

  static DateTime? _date(Object? raw) =>
      raw is String ? DateTime.tryParse(raw)?.toLocal() : null;

  factory NotifyState.fromJson(Map<String, dynamic> j) => NotifyState(
    uid: j['uid'] as String?,
    role: j['role'] as String?,
    student: j['student'] == true,
    phoneEnabled: j['phoneEnabled'] != false,
    reminders: j['reminders'] != false,
    promptDismissed: j['promptDismissed'] == true,
    seenAnnouncementsAt: _date(j['seenAnnouncementsAt']),
    lastNoticeAt: _date(j['lastNoticeAt']),
    surfacedIds: [
      for (final i in (j['surfacedIds'] as List? ?? const []))
        if (i is String) i,
    ],
    chatUnread: (j['chatUnread'] as num?)?.toInt() ?? 0,
    lastAnnouncementAt: _date(j['lastAnnouncementAt']),
    reminderDay: j['reminderDay'] as String?,
  );
}

abstract class NotifyStateStore {
  Future<NotifyState> load();
  Future<void> save(NotifyState state);
}

class MemoryNotifyStateStore implements NotifyStateStore {
  NotifyState _state;
  MemoryNotifyStateStore([this._state = const NotifyState()]);

  @override
  Future<NotifyState> load() async => _state;
  @override
  Future<void> save(NotifyState state) async => _state = state;
}

/// Um ficheiro JSON na pasta privada da app (escrita atómica).
class FileNotifyStateStore implements NotifyStateStore {
  Future<File> _file() async {
    final dir = await getApplicationSupportDirectory();
    return File('${dir.path}/notify_state.json');
  }

  @override
  Future<NotifyState> load() async {
    try {
      final f = await _file();
      if (!await f.exists()) return const NotifyState();
      return NotifyState.fromJson(
        jsonDecode(await f.readAsString()) as Map<String, dynamic>,
      );
    } catch (_) {
      return const NotifyState();
    }
  }

  @override
  Future<void> save(NotifyState state) async {
    try {
      final f = await _file();
      final tmp = File('${f.path}.tmp');
      await tmp.writeAsString(jsonEncode(state.toJson()), flush: true);
      await tmp.rename(f.path);
    } catch (_) {}
  }
}

NotifyStateStore defaultNotifyStateStore() =>
    kIsWeb ? MemoryNotifyStateStore() : FileNotifyStateStore();
