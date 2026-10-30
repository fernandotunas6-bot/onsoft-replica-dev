import '../auth/auth_state.dart' show UserRole;
import '../sga/sga_notifications.dart';
import '../sga/sga_work.dart';
import 'notify_state.dart';
import 'phone_notifications.dart' show PhoneChannel;

/// O pulso do portal (`/api/mobile/notifications?pulse=1`): só o que é novo.
class NoticePulse {
  final List<PersonalNotice> items;
  final int unread;

  /// Mensagens por ler; null se o portal não as conseguiu contar.
  final int? chatUnread;
  final List<PulseAnnouncement> announcements;

  const NoticePulse({
    this.items = const [],
    this.unread = 0,
    this.chatUnread,
    this.announcements = const [],
  });

  factory NoticePulse.fromJson(Map<String, dynamic> j) => NoticePulse(
    items: NoticeFeed.fromJson(j).items,
    unread: (j['unread'] as num?)?.toInt() ?? 0,
    chatUnread: (j['chatUnread'] as num?)?.toInt(),
    announcements: [
      for (final a in (j['announcements'] as List? ?? const []))
        if (a is Map<String, dynamic> && a['id'] is String)
          PulseAnnouncement.fromJson(a),
    ],
  );
}

class PulseAnnouncement {
  final String id;
  final String title;
  final DateTime? publishedAt;

  const PulseAnnouncement({
    required this.id,
    required this.title,
    this.publishedAt,
  });

  factory PulseAnnouncement.fromJson(Map<String, dynamic> j) =>
      PulseAnnouncement(
        id: j['id'] as String,
        title: (j['title'] as String? ?? '').trim(),
        publishedAt: DateTime.tryParse(
          j['publishedAt'] as String? ?? '',
        )?.toLocal(),
      );
}

/// Uma notificação a mostrar no telemóvel.
class PlannedAlert {
  /// Chave estável: a mesma chave substitui o aviso anterior no Android.
  final String key;
  final String title;
  final String body;
  final PhoneChannel channel;
  final String? route;

  const PlannedAlert({
    required this.key,
    required this.title,
    required this.body,
    required this.channel,
    this.route,
  });

  @override
  String toString() => 'PlannedAlert($key: $title)';
}

class NotifyPlan {
  final List<PlannedAlert> alerts;
  final NotifyState state;
  const NotifyPlan(this.alerts, this.state);
}

UserRole? roleFromName(String? name) => switch (name) {
  'admin' => UserRole.admin,
  'teacher' => UserRole.teacher,
  'parent' => UserRole.parent,
  _ => null,
};

/// Entre as 22h e as 6h a verificação não corre: nada acorda ninguém.
bool isQuietHour(DateTime now) => now.hour >= 22 || now.hour < 6;

/// Desde quando pedir avisos: na primeira vez, só as últimas 24 horas, para
/// não despejar no telemóvel o histórico inteiro.
DateTime noticesAfter(NotifyState state, DateTime now) =>
    state.lastNoticeAt ?? now.subtract(const Duration(hours: 24));

const _maxSeparate = 3;

String _short(String text, [int max = 240]) {
  final t = text.trim();
  return t.length <= max ? t : '${t.substring(0, max - 1).trimRight()}…';
}

/// O que mostrar a partir do pulso, e as novas marcas. Nunca repete um aviso,
/// junta-os quando são muitos e, na primeira verificação, só regista o ponto
/// de partida das mensagens e dos comunicados.
NotifyPlan planFromPulse(
  NoticePulse pulse,
  NotifyState state, {
  required UserRole? role,
  required DateTime now,
}) {
  final alerts = <PlannedAlert>[];
  var next = state;

  // Avisos pessoais por ler e ainda não mostrados.
  final fresh = [
    for (final n in pulse.items)
      if (!n.read && !state.wasSurfaced(n.id)) n,
  ]..sort((a, b) => b.createdAt.compareTo(a.createdAt));
  if (fresh.isNotEmpty) {
    if (fresh.length <= _maxSeparate) {
      for (final n in fresh) {
        alerts.add(
          PlannedAlert(
            key: 'notice:${n.id}',
            title: n.title.isEmpty
                ? 'Novo aviso da escola'
                : _short(n.title, 80),
            body: _short(n.body.isEmpty ? 'Abra a app para ver.' : n.body),
            channel: n.kind == NoticeKind.announcement
                ? PhoneChannel.announcements
                : PhoneChannel.notices,
            route: noticeRoute(n.kind, role) ?? '/notificacoes',
          ),
        );
      }
    } else {
      alerts.add(
        PlannedAlert(
          key: 'notices:summary',
          title: '${fresh.length} avisos novos',
          body: [
            for (final n in fresh.take(4)) '• ${_short(n.title, 60)}',
          ].join('\n'),
          channel: PhoneChannel.notices,
          route: '/notificacoes',
        ),
      );
    }
    next = next.surfaced([for (final n in fresh) n.id], fresh.first.createdAt);
  }

  // Mensagens: só quando o número por ler sobe. O texto nunca vai para o
  // ecrã bloqueado; a pessoa abre a conversa na app.
  final chat = pulse.chatUnread;
  if (chat != null) {
    final firstRun =
        state.lastNoticeAt == null &&
        state.surfacedIds.isEmpty &&
        state.lastAnnouncementAt == null;
    final grew = chat - state.chatUnread;
    if (grew > 0 && !firstRun) {
      alerts.add(
        PlannedAlert(
          key: 'chat',
          title: grew == 1 ? 'Nova mensagem' : '$grew mensagens novas',
          body: 'Abra a app para ler.',
          channel: PhoneChannel.messages,
          route: '/mensagens',
        ),
      );
    }
    next = next.copyWith(chatUnread: chat);
  }

  // Comunicados novos (o pulso já só traz os publicados depois da marca).
  final published = [
    for (final a in pulse.announcements)
      if (a.publishedAt != null) a,
  ]..sort((a, b) => b.publishedAt!.compareTo(a.publishedAt!));
  if (state.lastAnnouncementAt == null) {
    // Primeira vez: começa a contar daqui.
    next = next.copyWith(
      lastAnnouncementAt: published.isEmpty ? now : published.first.publishedAt,
    );
  } else if (published.isNotEmpty) {
    final news = [
      for (final a in published)
        if (a.publishedAt!.isAfter(state.lastAnnouncementAt!)) a,
    ];
    if (news.isNotEmpty) {
      alerts.add(
        PlannedAlert(
          key: news.length == 1
              ? 'announcement:${news.first.id}'
              : 'announcements',
          title: news.length == 1
              ? 'Novo comunicado'
              : '${news.length} comunicados novos',
          body: news.length == 1
              ? _short(news.first.title, 120)
              : [
                  for (final a in news.take(4)) '• ${_short(a.title, 60)}',
                ].join('\n'),
          channel: PhoneChannel.announcements,
          route: '/notices',
        ),
      );
      next = next.copyWith(lastAnnouncementAt: news.first.publishedAt);
    }
  }

  return NotifyPlan(alerts, next);
}

/// Hora dos lembretes da véspera: ao fim da tarde, uma vez por dia.
bool isReminderTime(NotifyState state, DateTime now) =>
    state.reminders &&
    now.hour >= 17 &&
    now.hour < 21 &&
    state.reminderDay != dayKey(now);

String dayKey(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// A agenda e os trabalhos de um aluno; [who] é o primeiro nome do educando
/// (vazio quando é o próprio aluno).
typedef StudentDay = ({String who, StudentAgenda? agenda, WorkOverview? work});

/// Lembretes para amanhã: avaliações marcadas e trabalhos por entregar.
PlannedAlert? planTomorrow(List<StudentDay> students, DateTime now) {
  final tomorrow = DateTime(now.year, now.month, now.day + 1);
  bool isTomorrow(DateTime? d) =>
      d != null &&
      d.year == tomorrow.year &&
      d.month == tomorrow.month &&
      d.day == tomorrow.day;

  final lines = <String>[];
  var assessments = 0;
  var works = 0;
  for (final s in students) {
    final prefix = s.who.isEmpty ? '' : '${s.who}: ';
    for (final a
        in s.agenda?.upcomingAssessments ?? const <AgendaAssessment>[]) {
      if (!isTomorrow(a.date)) continue;
      assessments++;
      final subject = a.subjectName.isEmpty ? '' : ' de ${a.subjectName}';
      lines.add('$prefix${a.name}$subject');
    }
    for (final t in s.work?.tasks ?? const <WorkTask>[]) {
      if (!t.pending || !isTomorrow(t.dueOn)) continue;
      works++;
      final subject = t.subjectName.isEmpty ? '' : ' (${t.subjectName})';
      lines.add('${prefix}Entregar «${t.title}»$subject');
    }
  }
  if (lines.isEmpty) return null;

  final String title;
  if (lines.length == 1) {
    title = assessments == 1
        ? 'Amanhã há avaliação'
        : 'Amanhã termina um trabalho';
  } else {
    final parts = [
      if (assessments > 0)
        assessments == 1 ? '1 avaliação' : '$assessments avaliações',
      if (works > 0) works == 1 ? '1 trabalho' : '$works trabalhos',
    ];
    title = 'Amanhã: ${parts.join(' e ')}';
  }
  return PlannedAlert(
    key: 'reminder:${dayKey(tomorrow)}',
    title: title,
    body: lines.take(5).join('\n'),
    channel: PhoneChannel.reminders,
    route: assessments > 0 ? '/dashboard' : '/trabalhos',
  );
}
