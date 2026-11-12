import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../sga/sga_notifications.dart' show isAllowedNoticeRoute;

/// Os canais do Android: a pessoa pode silenciar cada um nas definições.
enum PhoneChannel {
  notices(
    'avisos',
    'Avisos da escola',
    'Trabalhos, avaliações, notas e horário.',
  ),
  messages('mensagens', 'Mensagens', 'Mensagens novas nas conversas.'),
  announcements('comunicados', 'Comunicados', 'Comunicados da escola.'),
  reminders(
    'lembretes',
    'Lembretes',
    'Avaliações e trabalhos para o dia seguinte.',
  );

  const PhoneChannel(this.id, this.label, this.description);
  final String id;
  final String label;
  final String description;
}

/// Notificações no telemóvel (Android). Na web e nos testes não faz nada.
///
/// O toque leva ao ecrã do aviso: o caminho vai no `payload` e só abre se for
/// um dos ecrãs da app (`isAllowedNoticeRoute`).
class PhoneNotifications {
  PhoneNotifications._();
  static final instance = PhoneNotifications._();

  final _plugin = FlutterLocalNotificationsPlugin();
  bool _ready = false;
  void Function(String route)? _onTap;

  static bool get supported =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  AndroidFlutterLocalNotificationsPlugin? get _android => _plugin
      .resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin
      >();

  /// Prepara o plugin (também no segundo plano, sem [onTap]).
  Future<bool> init({void Function(String route)? onTap}) async {
    if (!supported) return false;
    if (onTap != null) _onTap = onTap;
    if (_ready) return true;
    try {
      await _plugin.initialize(
        settings: const InitializationSettings(
          android: AndroidInitializationSettings('ic_notification'),
        ),
        onDidReceiveNotificationResponse: (r) {
          final route = r.payload;
          if (isAllowedNoticeRoute(route)) _onTap?.call(route!);
        },
      );
      _ready = true;
    } catch (_) {
      _ready = false;
    }
    return _ready;
  }

  /// O caminho do aviso que abriu a app (toque com a app fechada), uma vez.
  Future<String?> takeLaunchRoute() async {
    if (!await init()) return null;
    try {
      final details = await _plugin.getNotificationAppLaunchDetails();
      if (details?.didNotificationLaunchApp != true) return null;
      final route = details!.notificationResponse?.payload;
      return isAllowedNoticeRoute(route) ? route : null;
    } catch (_) {
      return null;
    }
  }

  /// Autorizadas pelo Android (no 13 e seguintes, a pessoa tem de deixar).
  Future<bool> allowed() async {
    if (!await init()) return false;
    try {
      return await _android?.areNotificationsEnabled() ?? false;
    } catch (_) {
      return false;
    }
  }

  /// Pede autorização (Android 13+); nas versões anteriores já está dada.
  Future<bool> requestPermission() async {
    if (!await init()) return false;
    try {
      return await _android?.requestNotificationsPermission() ?? false;
    } catch (_) {
      return false;
    }
  }

  /// Abre as definições de notificações desta app no Android.
  Future<void> openSettings() async {
    if (!await init()) return;
    try {
      await _android?.openAppNotificationSettings();
    } catch (_) {}
  }

  Future<void> show({
    required int id,
    required String title,
    required String body,
    required PhoneChannel channel,
    String? route,
  }) async {
    if (!await init()) return;
    try {
      await _plugin.show(
        id: id,
        title: title,
        body: body,
        payload: isAllowedNoticeRoute(route) ? route : null,
        notificationDetails: NotificationDetails(
          android: AndroidNotificationDetails(
            channel.id,
            channel.label,
            channelDescription: channel.description,
            importance: channel == PhoneChannel.reminders
                ? Importance.defaultImportance
                : Importance.high,
            priority: channel == PhoneChannel.reminders
                ? Priority.defaultPriority
                : Priority.high,
            styleInformation: BigTextStyleInformation(body),
            category: switch (channel) {
              PhoneChannel.messages => AndroidNotificationCategory.message,
              PhoneChannel.reminders => AndroidNotificationCategory.reminder,
              _ => AndroidNotificationCategory.event,
            },
            // O conteúdo dos avisos é pessoal: no ecrã bloqueado só o título.
            visibility: NotificationVisibility.private,
          ),
        ),
      );
    } catch (_) {}
  }

  /// Ao sair da conta: nada fica no telemóvel.
  Future<void> clearAll() async {
    if (!_ready) return;
    try {
      await _plugin.cancelAll();
    } catch (_) {}
  }
}

/// Um número estável por aviso (o Android substitui o aviso com o mesmo id).
int phoneNotificationId(String key) => key.hashCode & 0x3fffffff;
