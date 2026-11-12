import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:workmanager/workmanager.dart';

import '../auth/auth_state.dart' show UserRole;
import '../network/api_client.dart' show kApiBaseUrl;
import '../sga/sga_auth.dart';
import '../sga/sga_config.dart';
import '../sga/sga_work.dart';
import 'notify_planner.dart';
import 'notify_state.dart';
import 'phone_notifications.dart';

const kNotifyTaskName = 'siga-avisos';
const kNotifyUniqueName = 'siga-avisos-periodico';

/// De quanto em quanto tempo o Android acorda a app para ver se há avisos.
/// Meia hora poupa bateria e dados; com a app aberta, o tempo real é imediato.
const kNotifyFrequency = Duration(minutes: 30);

/// Ponto de entrada do Android (outro isolate, sem ecrã).
@pragma('vm:entry-point')
void sgaNotifyDispatcher() {
  Workmanager().executeTask((task, input) async {
    try {
      await runNotifyCheck();
    } catch (_) {
      // Nunca falhar: o WorkManager repetiria logo, a gastar bateria e dados.
    }
    return true;
  });
}

/// A verificação periódica no Android: ligar, desligar e correr.
class BackgroundNotify {
  static bool get supported => PhoneNotifications.supported && sgaMode;

  static Future<void> initialize() async {
    if (!supported) return;
    try {
      await Workmanager().initialize(sgaNotifyDispatcher);
    } catch (_) {}
  }

  static Future<void> schedule() async {
    if (!supported) return;
    try {
      await Workmanager().registerPeriodicTask(
        kNotifyUniqueName,
        kNotifyTaskName,
        frequency: kNotifyFrequency,
        initialDelay: const Duration(minutes: 5),
        constraints: Constraints(networkType: NetworkType.connected),
        existingWorkPolicy: ExistingPeriodicWorkPolicy.keep,
      );
    } catch (_) {}
  }

  static Future<void> cancel() async {
    if (!supported) return;
    try {
      await Workmanager().cancelByUniqueName(kNotifyUniqueName);
    } catch (_) {}
  }
}

/// Corre uma verificação com a sessão guardada no telemóvel.
Future<int> runNotifyCheck() async {
  WidgetsFlutterBinding.ensureInitialized();
  final now = DateTime.now();
  if (isQuietHour(now)) return 0;
  final store = defaultNotifyStateStore();
  final saved = await store.load();
  if (!saved.phoneEnabled) return 0;

  final session = SgaSession(
    SgaAuthClient(SgaConfig.fromEnvironment),
    const SecureSgaTokenStorage(),
  );
  if (!await session.restore()) return 0;
  final uid = session.tokens?.userId ?? '';
  if (uid.isEmpty) return 0;

  final phone = PhoneNotifications.instance;
  if (!await phone.allowed()) return 0;

  Dio client(String baseUrl) {
    final dio = Dio(
      BaseOptions(
        baseUrl: baseUrl,
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(seconds: 20),
        headers: {'Content-Type': 'application/json'},
      ),
    );
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await session.accessToken();
          if (token != null) options.headers['Authorization'] = 'Bearer $token';
          final school = session.schoolId;
          if (school != null) options.headers['X-School-Id'] = school;
          handler.next(options);
        },
      ),
    );
    return dio;
  }

  final checker = NotifyChecker(
    portal: client(SgaConfig.fromEnvironment.portalUrl),
    worker: client(kApiBaseUrl),
    store: store,
    show: (alert) => phone.show(
      id: phoneNotificationId(alert.key),
      title: alert.title,
      body: alert.body,
      channel: alert.channel,
      route: alert.route,
    ),
  );
  return checker.run(uid: uid, now: now);
}

typedef ShowAlert = Future<void> Function(PlannedAlert alert);

/// A verificação em si, sem plugins: testável com um servidor falso.
class NotifyChecker {
  final Dio portal;
  final Dio worker;
  final NotifyStateStore store;
  final ShowAlert show;

  NotifyChecker({
    required this.portal,
    required this.worker,
    required this.store,
    required this.show,
  });

  Future<int> run({required String uid, required DateTime now}) async {
    final start = (await store.load()).forUser(uid);
    if (!start.phoneEnabled || isQuietHour(now)) return 0;
    final role = roleFromName(start.role);

    final res = await portal.get(
      '/api/mobile/notifications',
      queryParameters: {
        'pulse': '1',
        'after': noticesAfter(start, now).toUtc().toIso8601String(),
        if (start.lastAnnouncementAt != null)
          'announcements_after': start.lastAnnouncementAt!
              .toUtc()
              .toIso8601String(),
      },
    );
    final plan = planFromPulse(
      NoticePulse.fromJson(res.data as Map<String, dynamic>),
      start,
      role: role,
      now: now,
    );
    final alerts = [...plan.alerts];
    var state = plan.state;

    if (isReminderTime(state, now) &&
        (state.student || role == UserRole.parent)) {
      try {
        final reminder = planTomorrow(await _studentDays(state.student), now);
        if (reminder != null) alerts.add(reminder);
        state = state.copyWith(reminderDay: dayKey(now));
      } catch (e) {
        if (kDebugMode) debugPrint('[avisos] lembretes: $e');
      }
    }

    for (final alert in alerts) {
      await show(alert);
    }
    // A app pode ter mudado as escolhas entretanto: guardar só as marcas.
    final latest = (await store.load()).forUser(uid);
    await store.save(
      latest.copyWith(
        surfacedIds: state.surfacedIds,
        lastNoticeAt: state.lastNoticeAt,
        chatUnread: state.chatUnread,
        lastAnnouncementAt: state.lastAnnouncementAt,
        reminderDay: state.reminderDay,
      ),
    );
    return alerts.length;
  }

  /// Agenda e trabalhos do próprio aluno, ou de cada educando (até três).
  Future<List<StudentDay>> _studentDays(bool student) async {
    Future<StudentDay> day(String who, String? studentId) async {
      final query = studentId == null ? null : {'student_id': studentId};
      final agenda = await portal.get(
        '/api/mobile/agenda',
        queryParameters: query,
      );
      final work = await portal.get('/api/mobile/work', queryParameters: query);
      return (
        who: who,
        agenda: StudentAgenda.fromJson(agenda.data as Map<String, dynamic>),
        work: WorkOverview.fromJson(work.data as Map<String, dynamic>),
      );
    }

    if (student) return [await day('', null)];
    final res = await worker.get('/api/sga/wards');
    final wards = [
      for (final w
          in ((res.data as Map<String, dynamic>)['data'] as List? ?? const []))
        if (w is Map<String, dynamic> && w['id'] is String) w,
    ];
    return [
      for (final w in wards.take(3))
        await day(
          (w['name'] as String? ?? '').trim().split(RegExp(r'\s+')).first,
          w['id'] as String,
        ),
    ];
  }
}
