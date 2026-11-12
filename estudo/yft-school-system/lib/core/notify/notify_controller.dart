import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/auth_state.dart';
import '../models/school_notice.dart';
import 'background_notify.dart';
import 'notify_state.dart';
import 'phone_notifications.dart';

/// O ficheiro partilhado com a verificação em segundo plano.
final NotifyStateStore appNotifyStore = defaultNotifyStateStore();

/// Escolhas e marcas dos avisos neste telemóvel, para os ecrãs.
class NotifyController extends AsyncNotifier<NotifyState> {
  @override
  Future<NotifyState> build() async {
    final uid = ref.watch(authProvider.select((s) => s?.uid));
    final saved = await appNotifyStore.load();
    return uid == null ? saved : saved.forUser(uid);
  }

  Future<void> _update(NotifyState Function(NotifyState s) change) async {
    final uid = ref.read(authProvider)?.uid;
    final base = await appNotifyStore.load();
    final current = uid == null ? base : base.forUser(uid);
    final next = change(current);
    await appNotifyStore.save(next);
    state = AsyncData(next);
  }

  /// Depois de entrar: o papel serve à verificação em segundo plano.
  Future<void> rememberSession(AppSession session) => _update(
    (s) => s.copyWith(
      role: switch (session.role) {
        UserRole.admin => 'admin',
        UserRole.teacher => 'teacher',
        UserRole.parent => 'parent',
      },
      student: session.isStudent,
    ),
  );

  /// Liga as notificações no telemóvel: pede autorização ao Android e começa
  /// a verificação periódica. Devolve se ficaram autorizadas.
  Future<bool> enablePhone() async {
    final granted =
        await PhoneNotifications.instance.allowed() ||
        await PhoneNotifications.instance.requestPermission();
    await _update((s) => s.copyWith(phoneEnabled: true, promptDismissed: true));
    if (granted) await BackgroundNotify.schedule();
    return granted;
  }

  Future<void> disablePhone() async {
    await _update((s) => s.copyWith(phoneEnabled: false));
    await BackgroundNotify.cancel();
  }

  Future<void> setReminders(bool on) =>
      _update((s) => s.copyWith(reminders: on));

  Future<void> dismissPrompt() =>
      _update((s) => s.copyWith(promptDismissed: true));

  /// Comunicados vistos até [at] (ao abrir a lista ou o centro de avisos).
  Future<void> markAnnouncementsSeen(DateTime at) async {
    final seen = state.whenOrNull(data: (s) => s.seenAnnouncementsAt);
    if (seen != null && !at.isAfter(seen)) return;
    await _update((s) => s.copyWith(seenAnnouncementsAt: at));
  }

  /// Avisos já mostrados no ecrã: a verificação em segundo plano não os repete.
  Future<void> markSurfaced(Iterable<String> ids, DateTime newest) =>
      _update((s) => s.surfaced(ids, newest));
}

final notifyControllerProvider =
    AsyncNotifierProvider<NotifyController, NotifyState>(NotifyController.new);

/// A data de um comunicado (o SIGA dá-a em texto ISO).
DateTime? announcementDate(SchoolNotice n) =>
    DateTime.tryParse(n.createdAt)?.toLocal();

/// Comunicados publicados depois da última vez que a pessoa os viu. Na
/// primeira vez não conta nenhum: os antigos não são novidade.
int unseenAnnouncements(List<SchoolNotice> notices, DateTime? seenAt) {
  if (seenAt == null) return 0;
  return notices.where((n) {
    final d = announcementDate(n);
    return d != null && d.isAfter(seenAt);
  }).length;
}
