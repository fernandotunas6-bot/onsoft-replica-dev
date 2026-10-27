import 'package:flutter_test/flutter_test.dart';
import 'package:yft_school_system/core/auth/auth_state.dart';
import 'package:yft_school_system/core/notify/notify_state.dart';
import 'package:yft_school_system/core/realtime/realtime_service.dart';
import 'package:yft_school_system/core/sga/sga_notifications.dart';
import 'package:yft_school_system/features/notifications/presentation/notice_visuals.dart';

void main() {
  test('os tipos do SIGA viram tipos da app, com destino por papel', () {
    expect(noticeKindFor('academic.task.created'), NoticeKind.work);
    expect(noticeKindFor('academic.task.returned'), NoticeKind.workReturned);
    expect(noticeKindFor('academic.task.algo_novo'), NoticeKind.work);
    expect(
      noticeKindFor('academic.assessment.scheduled'),
      NoticeKind.assessment,
    );
    expect(noticeKindFor('academic.grade_sheet.published'), NoticeKind.grades);
    expect(noticeKindFor('announcement.published'), NoticeKind.announcement);
    expect(noticeKindFor('access_request.approved'), NoticeKind.access);
    expect(noticeKindFor('?'), NoticeKind.other);

    expect(noticeRoute(NoticeKind.work, UserRole.parent), '/trabalhos');
    expect(noticeRoute(NoticeKind.work, UserRole.teacher), isNull);
    expect(noticeRoute(NoticeKind.grades, UserRole.parent), '/result-card');
    expect(noticeRoute(NoticeKind.grades, UserRole.teacher), '/results-setup');
    expect(noticeRoute(NoticeKind.schedule, UserRole.parent), '/calendario');
    expect(noticeRoute(NoticeKind.other, UserRole.parent), isNull);
  });

  test('um aviso só abre ecrãs da app', () {
    expect(isAllowedNoticeRoute('/trabalhos'), isTrue);
    expect(isAllowedNoticeRoute('/notificacoes'), isTrue);
    expect(isAllowedNoticeRoute('https://exemplo.com'), isFalse);
    expect(isAllowedNoticeRoute('/conversa/1'), isFalse);
    expect(isAllowedNoticeRoute(null), isFalse);
  });

  test('lista do portal: lidos, por ler e marcados aqui', () {
    final feed = NoticeFeed.fromJson({
      'items': [
        {
          'id': 'a',
          'title': ' Trabalho novo ',
          'body': 'Resumo',
          'eventType': 'academic.task.created',
          'read': false,
          'createdAt': '2026-10-27T08:00:00Z',
        },
        {
          'id': 'b',
          'title': 'Lido',
          'read': true,
          'createdAt': '2026-10-26T08:00:00Z',
        },
        {'title': 'sem id'},
      ],
      'unread': 1,
    });
    expect(feed.items.map((n) => n.id), ['a', 'b']);
    expect(feed.items.first.title, 'Trabalho novo');
    expect(feed.unread, 1);
    expect(feed.markedRead({'a'}).unread, 0);
    expect(feed.markedRead(null).items.every((n) => n.read), isTrue);
  });

  test('estado guardado: outra conta começa do zero, as escolhas ficam', () {
    final s = const NotifyState(
      uid: 'u1',
      reminders: false,
      chatUnread: 3,
    ).surfaced(['x'], DateTime(2026, 10, 27));
    final other = s.forUser('u2');
    expect(other.uid, 'u2');
    expect(other.reminders, isFalse);
    expect(other.chatUnread, 0);
    expect(other.surfacedIds, isEmpty);
    expect(s.forUser('u1'), same(s));

    final back = NotifyState.fromJson(s.toJson());
    expect(back.surfacedIds, ['x']);
    expect(back.lastNoticeAt, DateTime(2026, 10, 27));
    expect(back.reminders, isFalse);

    // Só os últimos 60 ids.
    var many = const NotifyState();
    for (var i = 0; i < 70; i++) {
      many = many.surfaced(['$i'], DateTime(2026, 10, 27));
    }
    expect(many.surfacedIds, hasLength(60));
    expect(many.wasSurfaced('69'), isTrue);
    expect(many.wasSurfaced('0'), isFalse);
  });

  test('tempo real: endereço e comunicados que merecem aviso', () {
    expect(
      SgaRealtime.endpointFor('https://xodg.supabase.co/'),
      'wss://xodg.supabase.co/realtime/v1',
    );
    final now = DateTime.utc(2026, 10, 27, 10);
    Map<String, dynamic> row({
      String status = 'sent',
      String? by,
      int minutesAgo = 2,
      Object? deleted,
    }) => {
      'id': 'c1',
      'status': status,
      'created_by': by,
      'deleted_at': deleted,
      'published_at': now
          .subtract(Duration(minutes: minutesAgo))
          .toIso8601String(),
    };
    expect(isFreshAnnouncement(row(), userId: 'eu', now: now), isTrue);
    expect(
      isFreshAnnouncement(
        row(status: 'draft'),
        userId: 'eu',
        now: now,
      ),
      isFalse,
    );
    expect(
      isFreshAnnouncement(
        row(by: 'eu'),
        userId: 'eu',
        now: now,
      ),
      isFalse,
    );
    expect(
      isFreshAnnouncement(row(minutesAgo: 30), userId: 'eu', now: now),
      isFalse,
    );
    expect(
      isFreshAnnouncement(
        row(deleted: 'x'),
        userId: 'eu',
        now: now,
      ),
      isFalse,
    );
  });

  test('hora dos avisos e grupos por dia', () {
    final now = DateTime(2026, 11, 5, 15, 0); // quinta-feira
    expect(
      noticeTime(now.subtract(const Duration(seconds: 20)), now: now),
      'agora',
    );
    expect(
      noticeTime(now.subtract(const Duration(minutes: 7)), now: now),
      'há 7 min',
    );
    expect(noticeTime(DateTime(2026, 11, 5, 9, 5), now: now), '09:05');
    expect(noticeTime(DateTime(2026, 11, 4, 14, 20), now: now), 'ontem, 14:20');
    expect(noticeTime(DateTime(2026, 11, 2, 8, 0), now: now), 'seg., 08:00');
    expect(noticeTime(DateTime(2026, 10, 12, 8, 0), now: now), '12/10');
    expect(noticeDayGroup(DateTime(2026, 11, 5, 1), now: now), 'Hoje');
    expect(noticeDayGroup(DateTime(2026, 11, 4, 23), now: now), 'Ontem');
    expect(noticeDayGroup(DateTime(2026, 11, 1), now: now), 'Esta semana');
    expect(noticeDayGroup(DateTime(2026, 10, 1), now: now), 'Anteriores');
  });
}
