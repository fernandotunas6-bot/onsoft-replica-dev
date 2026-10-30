import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/auth_state.dart';
import '../providers/repository_providers.dart' show currentUidProvider;
import 'sga_attendance.dart' show sgaPortalDioProvider;
import 'sga_config.dart';

/// De que trata um aviso: escolhe o ícone, a cor e para onde leva.
enum NoticeKind {
  work,
  workReturned,
  assessment,
  grades,
  schedule,
  lesson,
  announcement,
  exam,
  deadline,
  access,
  message,
  reminder,
  other,
}

/// O `event_type` do SIGA (tabela `notifications`) no tipo da app.
NoticeKind noticeKindFor(String eventType) => switch (eventType) {
  'academic.task.created' => NoticeKind.work,
  'academic.task.returned' => NoticeKind.workReturned,
  'academic.assessment.scheduled' => NoticeKind.assessment,
  'academic.grade_sheet.published' => NoticeKind.grades,
  'academic.schedule.published' => NoticeKind.schedule,
  'academic.lesson.reminder' => NoticeKind.lesson,
  'announcement.published' => NoticeKind.announcement,
  'exam.registered' => NoticeKind.exam,
  'academic.grades.deadline' => NoticeKind.deadline,
  final t when t.startsWith('access_request.') => NoticeKind.access,
  final t when t.startsWith('academic.task.') => NoticeKind.work,
  final t when t.startsWith('academic.grade') => NoticeKind.grades,
  _ => NoticeKind.other,
};

/// Ecrã da app para onde o aviso leva, conforme o papel; null = fica no centro
/// de notificações (o texto completo abre ali).
String? noticeRoute(NoticeKind kind, UserRole? role) {
  final staff = role == UserRole.teacher || role == UserRole.admin;
  return switch (kind) {
    NoticeKind.work || NoticeKind.workReturned => staff ? null : '/trabalhos',
    NoticeKind.assessment => staff ? '/results-setup' : '/dashboard',
    NoticeKind.grades ||
    NoticeKind.exam => staff ? '/results-setup' : '/result-card',
    NoticeKind.deadline => staff ? '/results-setup' : null,
    NoticeKind.schedule || NoticeKind.lesson => '/calendario',
    NoticeKind.announcement => '/notices',
    NoticeKind.message => '/mensagens',
    NoticeKind.reminder => '/dashboard',
    NoticeKind.access || NoticeKind.other => null,
  };
}

/// Só caminhos da própria app: um aviso nunca abre outro sítio.
const _allowedRoutes = {
  '/dashboard',
  '/trabalhos',
  '/result-card',
  '/results-setup',
  '/calendario',
  '/notices',
  '/mensagens',
  '/notificacoes',
  '/ward-attendance',
  '/payment-history',
};

bool isAllowedNoticeRoute(String? route) =>
    route != null && _allowedRoutes.contains(route);

/// Um aviso pessoal do SIGA (`notifications`, canal `in_app`), como o sino do
/// portal o mostra.
class PersonalNotice {
  final String id;
  final String title;
  final String body;
  final String eventType;
  final bool read;
  final DateTime createdAt;

  const PersonalNotice({
    required this.id,
    required this.title,
    required this.body,
    required this.eventType,
    required this.read,
    required this.createdAt,
  });

  NoticeKind get kind => noticeKindFor(eventType);

  PersonalNotice copyWith({bool? read}) => PersonalNotice(
    id: id,
    title: title,
    body: body,
    eventType: eventType,
    read: read ?? this.read,
    createdAt: createdAt,
  );

  factory PersonalNotice.fromJson(Map<String, dynamic> j) => PersonalNotice(
    id: j['id'] as String,
    title: (j['title'] as String? ?? '').trim(),
    body: (j['body'] as String? ?? '').trim(),
    eventType: j['eventType'] as String? ?? j['event_type'] as String? ?? '',
    read: j['read'] == true || j['read_at'] != null,
    createdAt:
        DateTime.tryParse(
          j['createdAt'] as String? ?? j['created_at'] as String? ?? '',
        )?.toLocal() ??
        DateTime.fromMillisecondsSinceEpoch(0),
  );
}

/// A lista do sino: os últimos avisos e quantos estão por ler.
class NoticeFeed {
  final List<PersonalNotice> items;
  final int unread;

  const NoticeFeed({this.items = const [], this.unread = 0});

  static const empty = NoticeFeed();

  factory NoticeFeed.fromJson(Map<String, dynamic> j) {
    final items = [
      for (final i in (j['items'] as List? ?? const []))
        if (i is Map<String, dynamic> && i['id'] is String)
          PersonalNotice.fromJson(i),
    ];
    return NoticeFeed(
      items: items,
      unread:
          (j['unread'] as num?)?.toInt() ?? items.where((n) => !n.read).length,
    );
  }

  /// Marcados como lidos aqui, antes de o servidor responder.
  NoticeFeed markedRead(Set<String>? ids) {
    final next = [
      for (final n in items)
        (ids == null || ids.contains(n.id)) ? n.copyWith(read: true) : n,
    ];
    return NoticeFeed(items: next, unread: next.where((n) => !n.read).length);
  }
}

/// Avisos pessoais pelas rotas `/api/mobile/notifications` do portal.
class SgaNotificationsRepository {
  static const _path = '/api/mobile/notifications';
  final Dio _portal;

  SgaNotificationsRepository(this._portal);

  Future<NoticeFeed> list() async {
    final res = await _portal.get(_path);
    return NoticeFeed.fromJson(res.data as Map<String, dynamic>);
  }

  /// Marca como lidos os indicados; sem [ids], todos.
  Future<void> markRead([List<String>? ids]) async {
    await _portal.post(_path, data: {'action': 'read', 'ids': ?ids});
  }
}

final sgaNotificationsRepositoryProvider = Provider<SgaNotificationsRepository>(
  (ref) => SgaNotificationsRepository(ref.watch(sgaPortalDioProvider)),
);

/// Os avisos da conta. Fora do modo SIGA não há avisos pessoais.
final personalNoticesProvider = FutureProvider<NoticeFeed>((ref) async {
  ref.watch(currentUidProvider);
  if (!sgaMode) return NoticeFeed.empty;
  return ref.read(sgaNotificationsRepositoryProvider).list();
});
