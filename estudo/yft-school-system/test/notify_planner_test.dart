import 'package:flutter_test/flutter_test.dart';
import 'package:yft_school_system/core/auth/auth_state.dart';
import 'package:yft_school_system/core/notify/notify_planner.dart';
import 'package:yft_school_system/core/notify/notify_state.dart';
import 'package:yft_school_system/core/notify/phone_notifications.dart';
import 'package:yft_school_system/core/sga/sga_notifications.dart';
import 'package:yft_school_system/core/sga/sga_work.dart';

PersonalNotice notice(
  String id,
  DateTime at, {
  String type = 'academic.task.created',
  bool read = false,
}) => PersonalNotice(
  id: id,
  title: 'Aviso $id',
  body: 'Texto do aviso $id',
  eventType: type,
  read: read,
  createdAt: at,
);

void main() {
  final now = DateTime(2026, 11, 5, 18, 30);
  // Já correu antes: tem as marcas.
  final running = NotifyState(
    uid: 'u1',
    role: 'parent',
    lastNoticeAt: now.subtract(const Duration(hours: 2)),
    lastAnnouncementAt: now.subtract(const Duration(days: 1)),
    chatUnread: 1,
  );

  group('avisos pessoais', () {
    test('cada aviso novo sai com o destino do tipo, e não se repete', () {
      final pulse = NoticePulse(
        items: [
          notice('a', now.subtract(const Duration(minutes: 5))),
          notice(
            'b',
            now.subtract(const Duration(minutes: 30)),
            type: 'academic.grade_sheet.published',
          ),
          notice('lido', now, read: true),
        ],
      );
      final plan = planFromPulse(
        pulse,
        running,
        role: UserRole.parent,
        now: now,
      );
      expect(plan.alerts.map((a) => (a.key, a.route, a.channel)), [
        ('notice:a', '/trabalhos', PhoneChannel.notices),
        ('notice:b', '/result-card', PhoneChannel.notices),
      ]);
      expect(plan.alerts.first.title, 'Aviso a');
      expect(plan.state.wasSurfaced('a'), isTrue);
      expect(plan.state.wasSurfaced('lido'), isFalse);
      expect(plan.state.lastNoticeAt, now.subtract(const Duration(minutes: 5)));

      // A mesma resposta outra vez: nada de novo.
      final again = planFromPulse(
        pulse,
        plan.state,
        role: UserRole.parent,
        now: now,
      );
      expect(again.alerts, isEmpty);
    });

    test('mais de três juntam-se num só aviso com os títulos', () {
      final pulse = NoticePulse(
        items: [
          for (var i = 0; i < 5; i++)
            notice('n$i', now.subtract(Duration(minutes: i))),
        ],
      );
      final plan = planFromPulse(
        pulse,
        running,
        role: UserRole.parent,
        now: now,
      );
      expect(plan.alerts, hasLength(1));
      expect(plan.alerts.single.title, '5 avisos novos');
      expect(plan.alerts.single.route, '/notificacoes');
      expect(plan.alerts.single.body.split('\n'), hasLength(4));
      expect(plan.state.surfacedIds, containsAll(['n0', 'n4']));
    });

    test(
      'o professor vai para as notas; um comunicado vai para o canal dele',
      () {
        final plan = planFromPulse(
          NoticePulse(
            items: [
              notice('p', now, type: 'academic.grades.deadline'),
              notice('c', now, type: 'announcement.published'),
            ],
          ),
          running,
          role: UserRole.teacher,
          now: now,
        );
        final byKey = {for (final a in plan.alerts) a.key: a};
        expect(byKey['notice:p']!.route, '/results-setup');
        expect(byKey['notice:c']!.channel, PhoneChannel.announcements);
        expect(byKey['notice:c']!.route, '/notices');
      },
    );
  });

  group('mensagens e comunicados', () {
    test('primeira verificação: só regista o ponto de partida', () {
      final plan = planFromPulse(
        NoticePulse(
          chatUnread: 4,
          announcements: [
            PulseAnnouncement(
              id: 'x',
              title: 'Antigo',
              publishedAt: now.subtract(const Duration(days: 3)),
            ),
          ],
        ),
        const NotifyState(uid: 'u1'),
        role: UserRole.parent,
        now: now,
      );
      expect(plan.alerts, isEmpty);
      expect(plan.state.chatUnread, 4);
      expect(
        plan.state.lastAnnouncementAt,
        now.subtract(const Duration(days: 3)),
      );
    });

    test('mensagens: avisa só quando sobe, sem o texto', () {
      final up = planFromPulse(
        const NoticePulse(chatUnread: 3),
        running,
        role: UserRole.parent,
        now: now,
      );
      expect(up.alerts.single.title, '2 mensagens novas');
      expect(up.alerts.single.body, 'Abra a app para ler.');
      expect(up.alerts.single.route, '/mensagens');
      expect(up.state.chatUnread, 3);

      final down = planFromPulse(
        const NoticePulse(chatUnread: 0),
        up.state,
        role: UserRole.parent,
        now: now,
      );
      expect(down.alerts, isEmpty);
      expect(down.state.chatUnread, 0);

      // Sem contagem (o portal não conseguiu): fica como estava.
      final unknown = planFromPulse(
        const NoticePulse(),
        up.state,
        role: UserRole.parent,
        now: now,
      );
      expect(unknown.state.chatUnread, 3);
    });

    test('comunicados novos: um com o título, vários juntos', () {
      PulseAnnouncement a(String id, int minutesAgo) => PulseAnnouncement(
        id: id,
        title: 'Comunicado $id',
        publishedAt: now.subtract(Duration(minutes: minutesAgo)),
      );
      final one = planFromPulse(
        NoticePulse(announcements: [a('1', 10)]),
        running,
        role: UserRole.parent,
        now: now,
      );
      expect(one.alerts.single.title, 'Novo comunicado');
      expect(one.alerts.single.body, 'Comunicado 1');
      expect(one.alerts.single.route, '/notices');
      expect(
        one.state.lastAnnouncementAt,
        now.subtract(const Duration(minutes: 10)),
      );

      final many = planFromPulse(
        NoticePulse(announcements: [a('2', 5), a('3', 1)]),
        one.state,
        role: UserRole.parent,
        now: now,
      );
      expect(many.alerts.single.title, '2 comunicados novos');
      expect(many.alerts.single.body, '• Comunicado 3\n• Comunicado 2');
    });
  });

  group('horas', () {
    test('silêncio das 22h às 6h', () {
      expect(isQuietHour(DateTime(2026, 11, 5, 21, 59)), isFalse);
      expect(isQuietHour(DateTime(2026, 11, 5, 22)), isTrue);
      expect(isQuietHour(DateTime(2026, 11, 6, 5, 59)), isTrue);
      expect(isQuietHour(DateTime(2026, 11, 6, 6)), isFalse);
    });

    test('lembretes: das 17h às 21h, uma vez por dia, se a pessoa quiser', () {
      const s = NotifyState();
      expect(isReminderTime(s, DateTime(2026, 11, 5, 16, 59)), isFalse);
      expect(isReminderTime(s, DateTime(2026, 11, 5, 17)), isTrue);
      expect(isReminderTime(s, DateTime(2026, 11, 5, 21)), isFalse);
      expect(
        isReminderTime(
          s.copyWith(reminderDay: '2026-11-05'),
          DateTime(2026, 11, 5, 18),
        ),
        isFalse,
      );
      expect(
        isReminderTime(s.copyWith(reminders: false), DateTime(2026, 11, 5, 18)),
        isFalse,
      );
    });

    test('na primeira vez, pede só as últimas 24 horas', () {
      expect(
        noticesAfter(const NotifyState(), now),
        now.subtract(const Duration(hours: 24)),
      );
      expect(noticesAfter(running, now), running.lastNoticeAt);
    });
  });

  group('lembretes da véspera', () {
    final tomorrow = DateTime(2026, 11, 6);
    StudentAgenda agenda(List<AgendaAssessment> a) =>
        StudentAgenda(upcomingAssessments: a);
    WorkOverview work(List<WorkTask> t) => WorkOverview(tasks: t);

    test('o aluno: avaliação e trabalho de amanhã', () {
      final alert = planTomorrow([
        (
          who: '',
          agenda: agenda([
            AgendaAssessment(
              name: 'Teste 1',
              subjectName: 'Física',
              date: tomorrow,
            ),
            AgendaAssessment(
              name: 'Prova',
              subjectName: 'Química',
              date: DateTime(2026, 11, 9),
            ),
          ]),
          work: work([
            WorkTask(
              id: 't',
              title: 'Resumo',
              kind: 'trabalho',
              subjectName: 'História',
              state: WorkState.open,
              dueOn: tomorrow,
            ),
            WorkTask(
              id: 'e',
              title: 'Já entregue',
              kind: 'trabalho',
              subjectName: 'História',
              state: WorkState.submitted,
              dueOn: tomorrow,
            ),
          ]),
        ),
      ], now)!;
      expect(alert.title, 'Amanhã: 1 avaliação e 1 trabalho');
      expect(alert.body, 'Teste 1 de Física\nEntregar «Resumo» (História)');
      expect(alert.route, '/dashboard');
      expect(alert.channel, PhoneChannel.reminders);
      expect(alert.key, 'reminder:2026-11-06');
    });

    test('o encarregado: o nome do educando à frente', () {
      final alert = planTomorrow([
        (
          who: 'Ana',
          agenda: agenda([
            AgendaAssessment(
              name: 'Teste',
              subjectName: 'Inglês',
              date: tomorrow,
            ),
          ]),
          work: null,
        ),
        (who: 'Rui', agenda: null, work: null),
      ], now)!;
      expect(alert.title, 'Amanhã há avaliação');
      expect(alert.body, 'Ana: Teste de Inglês');
    });

    test('só trabalhos leva aos trabalhos; nada amanhã, nada a dizer', () {
      final onlyWork = planTomorrow([
        (
          who: '',
          agenda: null,
          work: work([
            WorkTask(
              id: 't',
              title: 'Ficha',
              kind: 'exercicios',
              subjectName: '',
              state: WorkState.overdue,
              dueOn: tomorrow,
            ),
          ]),
        ),
      ], now)!;
      expect(onlyWork.title, 'Amanhã termina um trabalho');
      expect(onlyWork.route, '/trabalhos');
      expect(
        planTomorrow([(who: '', agenda: agenda([]), work: work([]))], now),
        isNull,
      );
    });
  });
}
