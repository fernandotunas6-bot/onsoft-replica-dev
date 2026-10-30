import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/auth_state.dart';
import '../models/school_notice.dart';
import '../notify/background_notify.dart';
import '../notify/notify_controller.dart';
import '../notify/phone_notifications.dart';
import '../providers/repository_providers.dart';
import '../routing/app_router.dart';
import '../sga/sga_config.dart';
import '../sga/sga_notifications.dart';
import '../sga/sga_providers.dart';
import '../../features/dashboard/presentation/providers/notices_providers.dart';
import 'realtime_service.dart';

/// As faixas «Novo aviso · Ver» aparecem por cima de qualquer ecrã.
final appMessengerKey = GlobalKey<ScaffoldMessengerState>();

/// O tempo real da conta (uma só ligação para a app inteira).
final sgaRealtimeProvider = Provider<SgaRealtime>((ref) {
  final realtime = SgaRealtime(
    config: SgaConfig.fromEnvironment,
    token: appSgaSession.accessToken,
  );
  ref.onDispose(realtime.stop);
  return realtime;
});

/// Sem tempo real, de quanto em quanto tempo ver se há avisos (app aberta).
const kForegroundPoll = Duration(minutes: 1);

/// Mantém a app ao corrente com a sessão aberta: liga o tempo real, verifica de
/// minuto a minuto o que não chega por ele, e mostra o que é novo — uma faixa
/// com a app à vista, uma notificação no telemóvel com a app em segundo plano.
class LiveUpdates extends ConsumerStatefulWidget {
  final Widget child;
  const LiveUpdates({super.key, required this.child});

  @override
  ConsumerState<LiveUpdates> createState() => _LiveUpdatesState();
}

class _LiveUpdatesState extends ConsumerState<LiveUpdates>
    with WidgetsBindingObserver {
  StreamSubscription<LiveEvent>? _events;
  Timer? _poll;
  Timer? _authRefresh;
  Timer? _sleep;
  bool _resumed = true;
  DateTime? _leftAt;
  String? _sessionKey;

  SgaRealtime get _realtime => ref.read(sgaRealtimeProvider);

  @override
  void initState() {
    super.initState();
    if (!sgaMode) return;
    WidgetsBinding.instance.addObserver(this);
    _events = _realtime.events.listen(_onEvent);
    _poll = Timer.periodic(kForegroundPoll, (_) => _pollTick());
    _authRefresh = Timer.periodic(
      const Duration(minutes: 30),
      (_) => _realtime.refreshAuth(),
    );
    WidgetsBinding.instance.addPostFrameCallback(
      (_) => _onSession(ref.read(authProvider)),
    );
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _events?.cancel();
    _poll?.cancel();
    _authRefresh?.cancel();
    _sleep?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final resumed = state == AppLifecycleState.resumed;
    if (resumed == _resumed) return;
    _resumed = resumed;
    if (resumed) {
      _sleep?.cancel();
      final away = _leftAt == null
          ? Duration.zero
          : DateTime.now().difference(_leftAt!);
      final session = ref.read(authProvider);
      if (session != null) {
        _startRealtime(session);
        // O que chegou enquanto a app esteve fora (não num simples pedido de
        // autorização ou numa espreitadela às notificações).
        if (away > const Duration(minutes: 1)) {
          ref.invalidate(personalNoticesProvider);
          ref.invalidate(conversationsUnreadProvider);
        }
        // A lista de comunicados é a mais pesada: só depois de uma ausência maior.
        if (away > const Duration(minutes: 10)) {
          ref.invalidate(parentNoticesProvider);
        }
      }
    } else {
      _leftAt = DateTime.now();
      // Um minuto de folga (atender uma chamada, mudar de app) antes de fechar
      // a ligação; depois, a verificação em segundo plano toma conta.
      _sleep?.cancel();
      _sleep = Timer(const Duration(minutes: 1), () {
        if (!_resumed) unawaited(_realtime.stop());
      });
    }
  }

  void _onSession(AppSession? session) {
    final key = session == null ? null : '${session.uid}|${session.schoolId}';
    if (key == _sessionKey) return;
    _sessionKey = key;
    if (session == null) {
      unawaited(_realtime.stop());
      return;
    }
    _startRealtime(session);
    unawaited(_prepareNotifications(session).catchError((_) {}));
  }

  void _startRealtime(AppSession session) {
    unawaited(
      _realtime
          .start(userId: session.uid, schoolId: session.schoolId)
          .catchError((_) {}),
    );
  }

  Future<void> _prepareNotifications(AppSession session) async {
    final controller = ref.read(notifyControllerProvider.notifier);
    await controller.rememberSession(session);
    final state = await ref.read(notifyControllerProvider.future);
    if (state.phoneEnabled && await PhoneNotifications.instance.allowed()) {
      await BackgroundNotify.schedule();
    }
  }

  void _pollTick() {
    if (!_resumed || ref.read(authProvider) == null) return;
    if (!_realtime.noticesLive.value) ref.invalidate(personalNoticesProvider);
    if (!_realtime.chatLive.value) ref.invalidate(conversationsUnreadProvider);
  }

  /// O tempo real só avisa que mudou; quem mostra são os ouvintes em [build].
  void _onEvent(LiveEvent event) {
    switch (event.kind) {
      case LiveKind.notice:
        ref.invalidate(personalNoticesProvider);
      case LiveKind.chat:
        ref.invalidate(conversationsUnreadProvider);
        ref.invalidate(conversationsProvider);
        final conversation = event.record['conversation_id'];
        if (conversation is String) {
          ref.invalidate(chatThreadProvider(conversation));
        }
      case LiveKind.announcement:
        ref.invalidate(parentNoticesProvider);
    }
  }

  String get _path {
    try {
      return appRouter.routerDelegate.currentConfiguration.uri.path;
    } catch (_) {
      return '';
    }
  }

  Future<void> _surface({
    required String key,
    required String title,
    required String body,
    required String route,
    required PhoneChannel channel,
  }) async {
    if (_resumed) {
      final messenger = appMessengerKey.currentState;
      if (messenger == null) return;
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            behavior: SnackBarBehavior.floating,
            duration: const Duration(seconds: 5),
            content: Text(
              body.isEmpty ? title : '$title\n$body',
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
            ),
            action: SnackBarAction(
              label: 'Ver',
              onPressed: () => appRouter.push(route),
            ),
          ),
        );
      return;
    }
    final state = ref.read(notifyControllerProvider).whenOrNull(data: (s) => s);
    if (state?.phoneEnabled != true) return;
    await PhoneNotifications.instance.show(
      id: phoneNotificationId(key),
      title: title,
      body: body,
      channel: channel,
      route: isAllowedNoticeRoute(route) ? route : '/notificacoes',
    );
  }

  void _onNotices(
    AsyncValue<NoticeFeed>? previous,
    AsyncValue<NoticeFeed> next,
  ) {
    final before = previous?.whenOrNull(data: (f) => f);
    final now = next.whenOrNull(data: (f) => f);
    if (before == null || now == null) return;
    final known = {for (final n in before.items) n.id};
    final surfaced = ref
        .read(notifyControllerProvider)
        .whenOrNull(data: (s) => s);
    final fresh = [
      for (final n in now.items)
        if (!n.read &&
            !known.contains(n.id) &&
            !(surfaced?.wasSurfaced(n.id) ?? false))
          n,
    ];
    if (fresh.isEmpty) return;
    unawaited(
      ref.read(notifyControllerProvider.notifier).markSurfaced([
        for (final n in fresh) n.id,
      ], fresh.first.createdAt),
    );
    if (_path == '/notificacoes') return;
    final role = ref.read(authProvider)?.role;
    final first = fresh.first;
    unawaited(
      _surface(
        key: fresh.length == 1 ? 'notice:${first.id}' : 'notices:summary',
        title: fresh.length == 1
            ? (first.title.isEmpty ? 'Novo aviso da escola' : first.title)
            : '${fresh.length} avisos novos',
        body: fresh.length == 1 ? first.body : first.title,
        route: fresh.length == 1
            ? (noticeRoute(first.kind, role) ?? '/notificacoes')
            : '/notificacoes',
        channel: first.kind == NoticeKind.announcement
            ? PhoneChannel.announcements
            : PhoneChannel.notices,
      ),
    );
  }

  void _onChatUnread(AsyncValue<int>? previous, AsyncValue<int> next) {
    final before = previous?.whenOrNull(data: (n) => n);
    final now = next.whenOrNull(data: (n) => n);
    if (before == null || now == null || now <= before) return;
    final path = _path;
    if (path == '/mensagens' || path.startsWith('/conversa/')) return;
    final grew = now - before;
    unawaited(
      _surface(
        key: 'chat',
        title: grew == 1 ? 'Nova mensagem' : '$grew mensagens novas',
        body: 'Toque em «Ver» para ler.',
        route: '/mensagens',
        channel: PhoneChannel.messages,
      ),
    );
  }

  void _onAnnouncements(
    AsyncValue<List<SchoolNotice>>? previous,
    AsyncValue<List<SchoolNotice>> next,
  ) {
    final now = next.whenOrNull(data: (l) => l);
    if (now == null) return;
    final controller = ref.read(notifyControllerProvider.notifier);
    final seen = ref
        .read(notifyControllerProvider)
        .whenOrNull(data: (s) => s.seenAnnouncementsAt);
    // Primeira vez neste telemóvel: os comunicados que já lá estão não são
    // novidade.
    if (seen == null) {
      final newest = now
          .map(announcementDate)
          .whereType<DateTime>()
          .fold<DateTime?>(null, (a, b) => a == null || b.isAfter(a) ? b : a);
      unawaited(controller.markAnnouncementsSeen(newest ?? DateTime.now()));
      return;
    }
    final before = previous?.whenOrNull(data: (l) => l);
    if (before == null) return;
    final known = {for (final n in before) n.id};
    final fresh = [
      for (final n in now)
        if (!known.contains(n.id)) n,
    ];
    if (fresh.isEmpty || _path == '/notices') return;
    unawaited(
      _surface(
        key: fresh.length == 1
            ? 'announcement:${fresh.first.id}'
            : 'announcements',
        title: fresh.length == 1
            ? 'Novo comunicado'
            : '${fresh.length} comunicados novos',
        body: fresh.first.title,
        route: '/notices',
        channel: PhoneChannel.announcements,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (sgaMode) {
      ref.listen<AppSession?>(authProvider, (_, next) => _onSession(next));
      // Ouvir mantém estes dados vivos: o tempo real e a verificação de minuto a
      // minuto só os marcam como velhos; o ouvinte decide o que é novidade.
      if (ref.watch(authProvider) != null) {
        ref.listen<AsyncValue<NoticeFeed>>(personalNoticesProvider, _onNotices);
        ref.listen<AsyncValue<int>>(conversationsUnreadProvider, _onChatUnread);
        ref.listen<AsyncValue<List<SchoolNotice>>>(
          parentNoticesProvider,
          _onAnnouncements,
        );
      }
    }
    return widget.child;
  }
}
