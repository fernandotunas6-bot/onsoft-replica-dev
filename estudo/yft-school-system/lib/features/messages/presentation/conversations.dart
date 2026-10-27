import 'dart:async';

import 'package:flutter/material.dart';
import 'package:yft_school_system/core/utils/date_utils.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/network/api_client.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';
import 'package:yft_school_system/core/repositories/conversations_repository.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/utils/media_url.dart';
import 'package:yft_school_system/core/utils/responsive_utils.dart';
import 'package:yft_school_system/core/widgets/profile_photo_avatar.dart';
import 'package:yft_school_system/core/widgets/section_widgets.dart';
import 'package:yft_school_system/features/calendar/application/school_events.dart';
import 'package:yft_school_system/features/messages/presentation/messages_screen.dart';
import 'package:yft_school_system/core/realtime/live_updates.dart' show sgaRealtimeProvider;

/// Lista das conversas 1:1 (separador "Conversas" de Mensagens).
class ConversationsList extends ConsumerWidget {
  final String query;

  const ConversationsList({super.key, this.query = ''});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(conversationsProvider);
    final pad = getResponsiveHorizontalPadding(context);
    final base = ref.read(dioProvider).options.baseUrl;

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(conversationsProvider);
        ref.invalidate(conversationsUnreadProvider);
        await ref.read(conversationsProvider.future);
      },
      child: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, _) => ListView(
          children: [
            EmptyHint(
              icon: LucideIcons.wifiOff,
              message: 'Não foi possível carregar as conversas.',
              action: TextButton(
                onPressed: () => ref.invalidate(conversationsProvider),
                child: const Text('Tentar de novo'),
              ),
            ),
          ],
        ),
        data: (all) {
          final q = query.trim().toLowerCase();
          final list = q.isEmpty
              ? all
              : all
                    .where(
                      (c) =>
                          c.otherName.toLowerCase().contains(q) ||
                          (c.lastPreview ?? '').toLowerCase().contains(q),
                    )
                    .toList();
          if (list.isEmpty) {
            return ListView(
              children: [
                EmptyHint(
                  icon: LucideIcons.messagesSquare,
                  message: q.isNotEmpty
                      ? 'Nada corresponde a "$query".'
                      : 'Ainda não tem conversas.\nToque em + para escrever a '
                            'um professor ou à direcção.',
                ),
              ],
            );
          }
          return ListView.separated(
            padding: EdgeInsets.fromLTRB(pad.left, 4, pad.right, 96),
            itemCount: list.length,
            separatorBuilder: (_, _) =>
                Divider(height: 1, color: AppColors.border),
            itemBuilder: (context, i) {
              final c = list[i];
              final unread = c.unread > 0;
              return InkWell(
                onTap: () => context.push('/conversa/${c.id}'),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Row(
                    children: [
                      ProfilePhotoCircle(
                        imageUrl: profilePhotoUrlFromKey(c.otherPhoto, base),
                        radius: 24,
                        fallbackLabel: c.otherName,
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    c.otherName,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      fontSize: 15,
                                      fontWeight: unread
                                          ? FontWeight.w600
                                          : FontWeight.w500,
                                      color: AppColors.textPrimary,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Text(
                                  relativeWhen(c.lastMessageAt ?? ''),
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: unread
                                        ? AppColors.primary
                                        : AppColors.textSecondary,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 3),
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    c.lastPreview ?? '',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      fontSize: 13,
                                      color: AppColors.textSecondary,
                                    ),
                                  ),
                                ),
                                if (unread) ...[
                                  const SizedBox(width: 8),
                                  CountBadge(count: c.unread),
                                ],
                              ],
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}

/// Escolher com quem começar uma conversa; abre-a ao tocar.
Future<void> showNewConversationSheet(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => const _ContactsSheet(),
  );
}

class _ContactsSheet extends ConsumerStatefulWidget {
  const _ContactsSheet();

  @override
  ConsumerState<_ContactsSheet> createState() => _ContactsSheetState();
}

class _ContactsSheetState extends ConsumerState<_ContactsSheet> {
  String _query = '';
  bool _opening = false;

  Future<void> _open(ChatContact c) async {
    setState(() => _opening = true);
    try {
      final id = await ref.read(conversationsRepositoryProvider).open(c.uid);
      if (!mounted) return;
      final router = GoRouter.of(context);
      Navigator.of(context).pop();
      router.push('/conversa/$id');
    } catch (_) {
      if (!mounted) return;
      setState(() => _opening = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Não foi possível abrir a conversa.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(chatContactsProvider);
    final base = ref.read(dioProvider).options.baseUrl;

    return DraggableScrollableSheet(
      initialChildSize: 0.8,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      builder: (context, scroll) => Container(
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: Column(
          children: [
            const SizedBox(height: 12),
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppColors.textSecondary.withValues(alpha: 0.3),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      'Nova conversa',
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textPrimary,
                      ),
                    ),
                  ),
                  if (_opening)
                    const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 8),
              child: TextField(
                onChanged: (v) => setState(() => _query = v),
                decoration: const InputDecoration(
                  hintText: 'Pesquisar pessoa ou educando…',
                  prefixIcon: Icon(LucideIcons.search, size: 18),
                  contentPadding: EdgeInsets.symmetric(vertical: 12),
                ),
              ),
            ),
            Expanded(
              child: async.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (_, _) => const EmptyHint(
                  icon: LucideIcons.wifiOff,
                  message: 'Não foi possível carregar os contactos.',
                ),
                data: (all) {
                  final q = _query.trim().toLowerCase();
                  final list = all
                      .where(
                        (c) =>
                            q.isEmpty ||
                            c.name.toLowerCase().contains(q) ||
                            (c.wards ?? '').toLowerCase().contains(q) ||
                            (c.subjects ?? '').toLowerCase().contains(q),
                      )
                      .toList();
                  if (list.isEmpty) {
                    return const EmptyHint(
                      icon: LucideIcons.users,
                      message: 'Ninguém corresponde à pesquisa.',
                    );
                  }
                  return ListView.builder(
                    controller: scroll,
                    padding: const EdgeInsets.fromLTRB(12, 0, 12, 24),
                    itemCount: list.length,
                    itemBuilder: (context, i) {
                      final c = list[i];
                      return ListTile(
                        enabled: !_opening,
                        onTap: () => _open(c),
                        leading: ProfilePhotoCircle(
                          imageUrl: profilePhotoUrlFromKey(c.photoUrl, base),
                          radius: 20,
                          fallbackLabel: c.name,
                        ),
                        title: Text(c.name),
                        subtitle: Text(
                          contactRoleLabel(
                            c.role,
                            subjects: c.subjects,
                            wards: c.wards,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      );
                    },
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Uma conversa: bolhas e caixa de escrita. Actualiza sozinha enquanto está
/// aberta (não há notificações push).
class ChatScreen extends ConsumerStatefulWidget {
  final String conversationId;

  const ChatScreen({super.key, required this.conversationId});

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final _text = TextEditingController();
  Timer? _poll;
  bool _sending = false;

  /// Todas as mensagens já vistas, por ordem: cada actualização junta as
  /// novas no fim e "Ver anteriores" junta as antigas no início, para que a
  /// página mais recente não apague o que se carregou para trás.
  final List<ChatMessage> _messages = [];
  final Set<String> _seen = {};
  bool? _olderHasMore;
  bool _loadingOlder = false;

  /// Guardado no início: no dispose o `ref` já não pode ser usado.
  late final ProviderContainer _container =
      ProviderScope.containerOf(context, listen: false);

  @override
  void initState() {
    super.initState();
    _container; // resolve já, enquanto o contexto está montado
    ref.listenManual(
      chatThreadProvider(widget.conversationId),
      (_, next) {
        final t = next.whenOrNull(data: (t) => t);
        if (t == null) return;
        final fresh = [for (final m in t.messages) if (!_seen.contains(m.id)) m];
        if (fresh.isEmpty) return;
        setState(() {
          _messages.addAll(fresh);
          _seen.addAll(fresh.map((m) => m.id));
        });
      },
      fireImmediately: true,
    );
    // Com o tempo real ligado, as mensagens novas chegam sozinhas; a
    // verificação passa de 15 s a 1 min (rede de segurança).
    var tick = 0;
    _poll = Timer.periodic(const Duration(seconds: 15), (_) {
      tick++;
      if (!mounted) return;
      if (ref.read(sgaRealtimeProvider).chatLive.value && tick % 4 != 0) return;
      ref.invalidate(chatThreadProvider(widget.conversationId));
    });
  }

  @override
  void dispose() {
    _poll?.cancel();
    _text.dispose();
    // Ao sair, a lista e o sino reflectem o que foi lido.
    _container.invalidate(conversationsProvider);
    _container.invalidate(conversationsUnreadProvider);
    super.dispose();
  }

  Future<void> _send() async {
    final body = _text.text.trim();
    if (body.isEmpty || _sending) return;
    setState(() => _sending = true);
    try {
      await ref
          .read(conversationsRepositoryProvider)
          .send(widget.conversationId, body);
      _text.clear();
      ref.invalidate(chatThreadProvider(widget.conversationId));
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Não foi possível enviar.')),
        );
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _loadOlder() async {
    if (_loadingOlder || _messages.isEmpty) return;
    setState(() => _loadingOlder = true);
    try {
      final page = await ref
          .read(conversationsRepositoryProvider)
          .older(widget.conversationId, _messages.first.id);
      if (!mounted) return;
      final older = [for (final m in page.messages) if (!_seen.contains(m.id)) m];
      setState(() {
        _messages.insertAll(0, older);
        _seen.addAll(older.map((m) => m.id));
        _olderHasMore = page.hasMore;
      });
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Não foi possível carregar as anteriores.')),
        );
      }
    } finally {
      if (mounted) setState(() => _loadingOlder = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(chatThreadProvider(widget.conversationId));
    final thread = async.whenOrNull(data: (t) => t);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        titleSpacing: 0,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              thread?.otherName ?? 'Conversa',
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
            ),
            if (thread != null && thread.otherRole.isNotEmpty)
              Text(
                contactRoleLabel(thread.otherRole),
                style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
              ),
          ],
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: async.when(
              skipLoadingOnReload: true,
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (_, _) => EmptyHint(
                icon: LucideIcons.wifiOff,
                message: 'Não foi possível carregar a conversa.',
                action: TextButton(
                  onPressed: () => ref.invalidate(
                    chatThreadProvider(widget.conversationId),
                  ),
                  child: const Text('Tentar de novo'),
                ),
              ),
              data: (t) {
                if (_messages.isEmpty) {
                  return const EmptyHint(
                    icon: LucideIcons.messageCircle,
                    message: 'Escreva a primeira mensagem.',
                  );
                }
                final hasMore = _olderHasMore ?? t.hasMore;
                final n = _messages.length;
                // Lista invertida: começa no fim (a mais recente) sem ter de
                // descer, e carregar as anteriores não mexe no que está à vista.
                return ListView.builder(
                  reverse: true,
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                  itemCount: n + (hasMore ? 1 : 0),
                  itemBuilder: (context, i) {
                    if (i == n) {
                      return Center(
                        child: TextButton(
                          onPressed: _loadingOlder ? null : _loadOlder,
                          child: Text(
                            _loadingOlder
                                ? 'A carregar…'
                                : 'Ver mensagens anteriores',
                          ),
                        ),
                      );
                    }
                    final k = n - 1 - i;
                    final day = _messageDay(_messages[k]);
                    final newDay = k == 0 || day != _messageDay(_messages[k - 1]);
                    final bubble = _Bubble(message: _messages[k]);
                    if (!newDay || day == null) return bubble;
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [_DayChip(day: day), bubble],
                    );
                  },
                );
              },
            ),
          ),
          SafeArea(
            top: false,
            child: Container(
              padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
              decoration: BoxDecoration(
                color: AppColors.surface,
                border: Border(top: BorderSide(color: AppColors.border)),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _text,
                      minLines: 1,
                      maxLines: 5,
                      maxLength: 2000,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: const InputDecoration(
                        hintText: 'Escrever mensagem…',
                        counterText: '',
                        contentPadding: EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 12,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  IconButton.filled(
                    tooltip: 'Enviar',
                    onPressed: _sending ? null : _send,
                    style: IconButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      foregroundColor: AppColors.onPrimary,
                    ),
                    icon: _sending
                        ? SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: AppColors.onPrimary,
                            ),
                          )
                        : const Icon(LucideIcons.send, size: 20),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Hora local de uma mensagem (o servidor grava em UTC, sem "T" nem "Z").
DateTime? _messageTime(ChatMessage m) =>
    parseServerTime(m.createdAt);

DateTime? _messageDay(ChatMessage m) {
  final t = _messageTime(m);
  return t == null ? null : dayOnly(t);
}

/// Separador de dia na conversa: "Hoje", "Ontem" ou "15 de Março".
class _DayChip extends StatelessWidget {
  final DateTime day;

  const _DayChip({required this.day});

  @override
  Widget build(BuildContext context) {
    final today = dayOnly(DateTime.now());
    final diff = today.difference(day).inDays;
    final label = switch (diff) {
      0 => 'Hoje',
      1 => 'Ontem',
      _ when day.year == today.year => formatDayMonth(day),
      _ => '${formatDayMonth(day)} de ${day.year}',
    };
    return Center(
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 10),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.border),
        ),
        child: Text(
          label,
          style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
        ),
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  final ChatMessage message;

  const _Bubble({required this.message});

  @override
  Widget build(BuildContext context) {
    final mine = message.mine;
    final when = _messageTime(message);
    final time = when == null
        ? ''
        : '${when.hour.toString().padLeft(2, '0')}:${when.minute.toString().padLeft(2, '0')}';
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.78,
        ),
        child: Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.fromLTRB(14, 10, 14, 8),
          decoration: BoxDecoration(
            color: mine ? AppColors.primary : AppColors.surface,
            border: mine ? null : Border.all(color: AppColors.border),
            borderRadius: BorderRadius.only(
              topLeft: const Radius.circular(18),
              topRight: const Radius.circular(18),
              bottomLeft: Radius.circular(mine ? 18 : 4),
              bottomRight: Radius.circular(mine ? 4 : 18),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              SelectableText(
                message.body,
                style: TextStyle(
                  fontSize: 15,
                  height: 1.35,
                  color: mine ? AppColors.onPrimary : AppColors.textPrimary,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                time,
                style: TextStyle(
                  fontSize: 11,
                  color: mine
                      ? AppColors.onPrimary.withValues(alpha: 0.75)
                      : AppColors.textSecondary,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
