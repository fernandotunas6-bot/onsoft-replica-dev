import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../../core/auth/auth_state.dart';
import '../../../core/models/school_notice.dart';
import '../../../core/notify/notify_controller.dart';
import '../../../core/notify/phone_notifications.dart';
import '../../../core/sga/sga_config.dart';
import '../../../core/sga/sga_notifications.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/utils/responsive_utils.dart';
import '../../../core/widgets/section_widgets.dart';
import '../../../core/widgets/skeleton.dart';
import '../../dashboard/presentation/providers/notices_providers.dart';
import 'notice_visuals.dart';

/// Autorização do Android para mostrar notificações (falso fora do Android).
final phoneNotificationsAllowedProvider = FutureProvider.autoDispose<bool>(
  (ref) => PhoneNotifications.instance.allowed(),
);

/// Uma linha da lista: um aviso pessoal ou um comunicado da escola.
class _Entry {
  final String id;
  final String title;
  final String body;
  final DateTime at;
  final bool unread;
  final NoticeKind kind;
  final PersonalNotice? personal;
  final SchoolNotice? announcement;

  const _Entry({
    required this.id,
    required this.title,
    required this.body,
    required this.at,
    required this.unread,
    required this.kind,
    this.personal,
    this.announcement,
  });
}

/// O sino: avisos pessoais (trabalhos, avaliações, notas, horário…) e
/// comunicados, do mais recente para o mais antigo, por dia.
class NotificationsScreen extends ConsumerStatefulWidget {
  /// Só com a conta do SIGA há avisos (null = o modo da compilação; os
  /// testes ligam-no à mão).
  final bool? enabled;

  const NotificationsScreen({super.key, this.enabled});

  @override
  ConsumerState<NotificationsScreen> createState() =>
      _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  bool _onlyUnread = false;

  /// Lidos aqui antes de o servidor responder.
  final Set<String> _readHere = {};

  /// Os comunicados vistos até abrir o ecrã: os mais novos mostram-se como
  /// novos durante esta visita, e o sino fica limpo.
  DateTime? _seenOnOpen;
  bool _seenCaptured = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback(
      (_) => _markAnnouncementsSeen(),
    );
  }

  void _markAnnouncementsSeen() {
    final state = ref.read(notifyControllerProvider).whenOrNull(data: (s) => s);
    if (!_seenCaptured && state != null) {
      _seenOnOpen = state.seenAnnouncementsAt;
      _seenCaptured = true;
    }
    final notices = ref.read(parentNoticesProvider).whenOrNull(data: (l) => l);
    if (notices == null || notices.isEmpty) return;
    final newest = notices
        .map(announcementDate)
        .whereType<DateTime>()
        .fold<DateTime?>(null, (a, b) => a == null || b.isAfter(a) ? b : a);
    if (newest != null) {
      unawaited(
        ref
            .read(notifyControllerProvider.notifier)
            .markAnnouncementsSeen(newest),
      );
    }
  }

  List<_Entry> _entries(NoticeFeed feed, List<SchoolNotice> notices) {
    final entries = <_Entry>[
      for (final n in feed.items)
        _Entry(
          id: 'n:${n.id}',
          title: n.title.isEmpty ? noticeVisual(n.kind).label : n.title,
          body: n.body,
          at: n.createdAt,
          unread: !n.read && !_readHere.contains(n.id),
          kind: n.kind,
          personal: n,
        ),
      for (final a in notices)
        if (announcementDate(a) case final at?)
          _Entry(
            id: 'a:${a.id}',
            title: a.title,
            body: a.body.isEmpty ? a.summary : a.body,
            at: at,
            unread: _seenOnOpen != null && at.isAfter(_seenOnOpen!),
            kind: NoticeKind.announcement,
            announcement: a,
          ),
    ]..sort((a, b) => b.at.compareTo(a.at));
    return entries;
  }

  Future<void> _refresh() async {
    ref.invalidate(personalNoticesProvider);
    ref.invalidate(parentNoticesProvider);
    await ref
        .read(personalNoticesProvider.future)
        .catchError((_) => NoticeFeed.empty);
  }

  Future<void> _markAllRead(NoticeFeed feed) async {
    setState(() => _readHere.addAll(feed.items.map((n) => n.id)));
    try {
      await ref.read(sgaNotificationsRepositoryProvider).markRead();
    } catch (_) {
      // Sem rede: fica marcado aqui; o servidor acerta na próxima vez.
    }
    ref.invalidate(personalNoticesProvider);
    _markAnnouncementsSeen();
  }

  Future<void> _open(_Entry e) async {
    final personal = e.personal;
    if (personal != null && e.unread) {
      setState(() => _readHere.add(personal.id));
      unawaited(
        ref
            .read(sgaNotificationsRepositoryProvider)
            .markRead([personal.id])
            .then((_) => ref.invalidate(personalNoticesProvider))
            .catchError((_) {}),
      );
    }
    final role = ref.read(authProvider)?.role;
    final route = e.announcement != null ? null : noticeRoute(e.kind, role);
    if (route != null) {
      unawaited(context.push(route));
      return;
    }
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: AppColors.surface,
      builder: (_) => _EntryDetail(entry: e),
    );
  }

  @override
  Widget build(BuildContext context) {
    final feedAsync = ref.watch(personalNoticesProvider);
    final notices =
        ref.watch(parentNoticesProvider).whenOrNull(data: (l) => l) ??
        const <SchoolNotice>[];
    final notify = ref
        .watch(notifyControllerProvider)
        .whenOrNull(data: (s) => s);
    if (!_seenCaptured && notify != null) {
      _seenOnOpen = notify.seenAnnouncementsAt;
      _seenCaptured = true;
    }
    final pad = getResponsiveHorizontalPadding(context);
    final feed = feedAsync.whenOrNull(data: (f) => f);
    final entries = feed == null ? const <_Entry>[] : _entries(feed, notices);
    final unread = entries.where((e) => e.unread).length;
    final shown = _onlyUnread
        ? entries.where((e) => e.unread).toList()
        : entries;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text(
          'Notificações',
          style: TextStyle(fontWeight: FontWeight.w600),
        ),
        actions: [
          if (feed != null && unread > 0)
            IconButton(
              tooltip: 'Marcar tudo como lido',
              onPressed: () => _markAllRead(feed),
              icon: const Icon(LucideIcons.checkCheck),
            ),
          IconButton(
            tooltip: 'Definições das notificações',
            onPressed: () => context.push('/notifications-settings'),
            icon: const Icon(LucideIcons.settings),
          ),
        ],
      ),
      body: !(widget.enabled ?? sgaMode)
          ? const EmptyHint(
              icon: LucideIcons.bellOff,
              message: 'Os avisos chegam pela conta do SIGA.',
            )
          : RefreshIndicator(
              onRefresh: _refresh,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: pad.copyWith(top: 12, bottom: 32),
                children: [
                  ResponsiveConstrainedContent(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const _PhonePrompt(),
                        PillTabs(
                          labels: const ['Todos', 'Por ler'],
                          selected: _onlyUnread ? 1 : 0,
                          badges: {1: unread},
                          onSelected: (i) =>
                              setState(() => _onlyUnread = i == 1),
                        ),
                        const SizedBox(height: 16),
                        ...feedAsync.when(
                          loading: () => [
                            for (var i = 0; i < 5; i++) ...[
                              const SkeletonCard(lines: 1),
                              const SizedBox(height: 10),
                            ],
                          ],
                          error: (_, _) => [
                            EmptyHint(
                              icon: LucideIcons.wifiOff,
                              message:
                                  'Não foi possível carregar os avisos. Verifique a ligação.',
                              action: TextButton.icon(
                                onPressed: _refresh,
                                icon: const Icon(
                                  LucideIcons.refreshCw,
                                  size: 16,
                                ),
                                label: const Text('Tentar de novo'),
                              ),
                            ),
                          ],
                          data: (_) => shown.isEmpty
                              ? [
                                  EmptyHint(
                                    icon: _onlyUnread
                                        ? LucideIcons.partyPopper
                                        : LucideIcons.bellOff,
                                    message: _onlyUnread
                                        ? 'Está tudo lido.'
                                        : 'Ainda não há avisos. Trabalhos, avaliações, notas e comunicados aparecem aqui.',
                                  ),
                                ]
                              : _grouped(shown),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
    );
  }

  List<Widget> _grouped(List<_Entry> shown) {
    final out = <Widget>[];
    String? group;
    for (final e in shown) {
      final g = noticeDayGroup(e.at);
      if (g != group) {
        group = g;
        out.add(
          Padding(
            padding: EdgeInsets.only(top: out.isEmpty ? 0 : 12, bottom: 8),
            child: Text(
              g,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppColors.textSecondary,
              ),
            ),
          ),
        );
      }
      out.add(
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: _EntryTile(entry: e, onTap: () => _open(e)),
        ),
      );
    }
    return out;
  }
}

class _EntryTile extends StatelessWidget {
  final _Entry entry;
  final VoidCallback onTap;

  const _EntryTile({required this.entry, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final v = noticeVisual(entry.kind);
    return Semantics(
      button: true,
      label: entry.unread ? 'Por ler: ${entry.title}' : entry.title,
      child: SoftCard(
        onTap: onTap,
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            IconTile(icon: v.icon, color: v.color, size: 40),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          v.label,
                          style: TextStyle(fontSize: 12, color: v.color),
                        ),
                      ),
                      Text(
                        noticeTime(entry.at),
                        style: TextStyle(
                          fontSize: 12,
                          color: AppColors.textSecondary,
                        ),
                      ),
                      if (entry.unread) ...[
                        const SizedBox(width: 6),
                        Container(
                          width: 8,
                          height: 8,
                          decoration: BoxDecoration(
                            color: AppColors.primary,
                            shape: BoxShape.circle,
                          ),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    entry.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: entry.unread
                          ? FontWeight.w600
                          : FontWeight.w500,
                      color: AppColors.textPrimary,
                    ),
                  ),
                  if (entry.body.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      entry.body,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 13,
                        height: 1.35,
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _EntryDetail extends StatelessWidget {
  final _Entry entry;
  const _EntryDetail({required this.entry});

  @override
  Widget build(BuildContext context) {
    final v = noticeVisual(entry.kind);
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                IconTile(icon: v.icon, color: v.color, size: 40),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    '${v.label} · ${noticeTime(entry.at)}',
                    style: TextStyle(
                      fontSize: 13,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Text(
              entry.title,
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w600,
                color: AppColors.textPrimary,
              ),
            ),
            if (entry.body.isNotEmpty) ...[
              const SizedBox(height: 10),
              SelectableText(
                entry.body,
                style: TextStyle(
                  fontSize: 15,
                  height: 1.5,
                  color: AppColors.textPrimary,
                ),
              ),
            ],
            if (entry.announcement != null) ...[
              const SizedBox(height: 20),
              OutlinedButton.icon(
                onPressed: () {
                  Navigator.of(context).pop();
                  context.push('/notices');
                },
                icon: const Icon(LucideIcons.megaphone, size: 18),
                label: const Text('Ver todos os comunicados'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// «Receber avisos no telemóvel», enquanto não estiverem ligados.
class _PhonePrompt extends ConsumerWidget {
  const _PhonePrompt();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!PhoneNotifications.supported) return const SizedBox.shrink();
    final state = ref
        .watch(notifyControllerProvider)
        .whenOrNull(data: (s) => s);
    final allowed = ref
        .watch(phoneNotificationsAllowedProvider)
        .whenOrNull(data: (a) => a);
    if (state == null || allowed == null) return const SizedBox.shrink();
    final on = state.phoneEnabled && allowed;
    if (on || state.promptDismissed) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: SoftCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                IconTile(
                  icon: LucideIcons.bellRing,
                  color: AppColors.primary,
                  size: 40,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Receber avisos no telemóvel',
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                          color: AppColors.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'Trabalhos, notas, avaliações, comunicados e mensagens, mesmo com a app fechada.',
                        style: TextStyle(
                          fontSize: 13,
                          height: 1.35,
                          color: AppColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton(
                  onPressed: () => ref
                      .read(notifyControllerProvider.notifier)
                      .dismissPrompt(),
                  child: const Text('Agora não'),
                ),
                const SizedBox(width: 8),
                FilledButton(
                  onPressed: () async {
                    final granted = await ref
                        .read(notifyControllerProvider.notifier)
                        .enablePhone();
                    ref.invalidate(phoneNotificationsAllowedProvider);
                    if (!granted && context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: const Text(
                            'O Android não deixou. Pode ligar nas definições do telemóvel.',
                          ),
                          action: SnackBarAction(
                            label: 'Abrir',
                            onPressed: PhoneNotifications.instance.openSettings,
                          ),
                        ),
                      );
                    }
                  },
                  child: const Text('Activar'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
