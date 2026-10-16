import 'package:flutter/material.dart';
import 'package:yft_school_system/core/utils/date_utils.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/auth/auth_state.dart';
import 'package:yft_school_system/core/models/school_notice.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/utils/responsive_utils.dart';
import 'package:yft_school_system/core/widgets/app_shell.dart';
import 'package:yft_school_system/core/widgets/section_widgets.dart';
import 'package:yft_school_system/features/dashboard/presentation/notices_screen.dart';
import 'package:yft_school_system/features/dashboard/presentation/providers/notices_providers.dart';
import 'package:yft_school_system/features/messages/application/favorite_notices.dart';
import 'package:yft_school_system/features/messages/presentation/conversations.dart';

/// Mensagens: conversas 1:1 com a escola e a caixa dos comunicados (com
/// pesquisa, não lidas e favoritas).
class MessagesScreen extends ConsumerStatefulWidget {
  const MessagesScreen({super.key});

  @override
  ConsumerState<MessagesScreen> createState() => _MessagesScreenState();
}

class _MessagesScreenState extends ConsumerState<MessagesScreen> {
  int _tab = 0;

  /// 0 = Conversas, 1 = Comunicados.
  int _section = 0;
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final role = ref.watch(authProvider)?.role;
    final noticesAsync = ref.watch(parentNoticesProvider);
    final favorites = ref.watch(favoriteNoticesProvider);
    final pad = getResponsiveHorizontalPadding(context);
    final unread =
        noticesAsync.whenOrNull(
          data: (n) => n.where((x) => !x.isRead).length,
        ) ??
        0;

    final chatUnread =
        ref.watch(conversationsUnreadProvider).whenOrNull(data: (n) => n) ?? 0;

    return AppShell(
      tab: AppTab.messages,
      floatingActionButton: _section == 0
          ? FloatingActionButton(
              tooltip: 'Nova conversa',
              onPressed: () => showNewConversationSheet(context),
              child: const Icon(LucideIcons.plus),
            )
          : null,
      body: SafeArea(
        child: ResponsiveConstrainedContent(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: EdgeInsets.fromLTRB(pad.left, 16, pad.right - 8, 12),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Mensagens',
                        style: Theme.of(context).textTheme.displayMedium,
                      ),
                    ),
                    if (role == UserRole.admin)
                      IconButton(
                        tooltip: 'Novo comunicado',
                        onPressed: () => context.push('/create-notice'),
                        icon: Icon(
                          LucideIcons.edit,
                          color: AppColors.secondary,
                        ),
                      ),
                  ],
                ),
              ),
              Padding(
                padding: EdgeInsets.fromLTRB(pad.left, 0, 0, 12),
                child: PillTabs(
                  labels: const ['Conversas', 'Comunicados'],
                  selected: _section,
                  badges: {0: chatUnread, 1: unread},
                  onSelected: (i) => setState(() => _section = i),
                ),
              ),
              Padding(
                padding: EdgeInsets.symmetric(horizontal: pad.left),
                child: TextField(
                  onChanged: (v) => setState(() => _query = v),
                  decoration: InputDecoration(
                    hintText: _section == 0
                        ? 'Pesquisar conversas…'
                        : 'Pesquisar comunicados…',
                    prefixIcon: const Icon(LucideIcons.search, size: 18),
                    fillColor: AppColors.textSecondary.withValues(alpha: 0.07),
                    contentPadding: const EdgeInsets.symmetric(vertical: 12),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(24),
                      borderSide: BorderSide.none,
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(24),
                      borderSide: BorderSide.none,
                    ),
                  ),
                ),
              ),
              if (_section == 0)
                Expanded(child: ConversationsList(query: _query))
              else ...[
                const SizedBox(height: 12),
                Padding(
                  padding: EdgeInsets.symmetric(horizontal: pad.left),
                  child: PillTabs(
                    labels: const ['Todas', 'Não lidas', 'Favoritas'],
                    selected: _tab,
                    badges: {1: unread},
                    onSelected: (i) => setState(() => _tab = i),
                  ),
                ),
                const SizedBox(height: 8),
                Expanded(
                  child: RefreshIndicator(
                    onRefresh: () async {
                      ref.invalidate(parentNoticesProvider);
                      ref.invalidate(unreadNoticesCountProvider);
                      await ref.read(parentNoticesProvider.future);
                    },
                    child: noticesAsync.when(
                      loading: () =>
                          const Center(child: CircularProgressIndicator()),
                      error: (_, _) => ListView(
                        children: [
                          EmptyHint(
                            icon: LucideIcons.wifiOff,
                            message: 'Não foi possível carregar as mensagens.',
                            action: TextButton(
                              onPressed: () =>
                                  ref.invalidate(parentNoticesProvider),
                              child: const Text('Tentar de novo'),
                            ),
                          ),
                        ],
                      ),
                      data: (notices) {
                        final q = _query.trim().toLowerCase();
                        final list = notices.where((n) {
                          if (_tab == 1 && n.isRead) return false;
                          if (_tab == 2 && !favorites.contains(n.id)) {
                            return false;
                          }
                          if (q.isEmpty) return true;
                          return n.title.toLowerCase().contains(q) ||
                              n.summary.toLowerCase().contains(q) ||
                              n.body.toLowerCase().contains(q);
                        }).toList();
                        if (list.isEmpty) {
                          return ListView(
                            children: [
                              EmptyHint(
                                icon: LucideIcons.messageCircle,
                                message: switch (_tab) {
                                  _ when q.isNotEmpty =>
                                    'Nada corresponde a "$_query".',
                                  1 => 'Está tudo lido.',
                                  2 =>
                                    'Ainda não tem favoritas. Toque na estrela '
                                        'de uma mensagem para a guardar aqui.',
                                  _ => 'Ainda não há mensagens.',
                                },
                              ),
                            ],
                          );
                        }
                        return ListView.separated(
                          padding: EdgeInsets.fromLTRB(
                            pad.left,
                            4,
                            pad.right,
                            32,
                          ),
                          itemCount: list.length,
                          separatorBuilder: (_, _) =>
                              Divider(height: 1, color: AppColors.border),
                          itemBuilder: (context, i) => _ConversationTile(
                            notice: list[i],
                            favorite: favorites.contains(list[i].id),
                            isAdmin: role == UserRole.admin,
                          ),
                        );
                      },
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _ConversationTile extends ConsumerWidget {
  final SchoolNotice notice;
  final bool favorite;

  /// Admin: mostra a quem foi e deixa apagar com toque longo.
  final bool isAdmin;

  const _ConversationTile({
    required this.notice,
    required this.favorite,
    this.isAdmin = false,
  });

  Future<void> _confirmDelete(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Apagar comunicado?'),
        content: Text('«${notice.title}» deixa de aparecer a todos.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancelar'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text('Apagar', style: TextStyle(color: AppColors.error)),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ref.read(noticesRepositoryProvider).delete(notice.id);
      ref.invalidate(parentNoticesProvider);
      ref.invalidate(unreadNoticesCountProvider);
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Não foi possível apagar.')),
        );
      }
    }
  }

  (IconData, Color) get _avatar => switch (notice.category.toLowerCase()) {
    'academic' ||
    'academico' ||
    'pedagogico' => (LucideIcons.graduationCap, AppColors.tileColors[2]),
    'payment' ||
    'finance' ||
    'fees' => (LucideIcons.wallet, AppColors.tileColors[3]),
    'event' ||
    'events' ||
    'evento' => (LucideIcons.calendarDays, AppColors.tileColors[1]),
    'urgent' || 'urgente' => (LucideIcons.alertTriangle, AppColors.error),
    _ => (LucideIcons.megaphone, AppColors.primary),
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final (icon, color) = _avatar;
    final unread = !notice.isRead;

    return InkWell(
      onTap: () => openNoticeSheet(context, ref, notice),
      onLongPress: isAdmin && notice.parentUid == null
          ? () => _confirmDelete(context, ref)
          : null,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Row(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: color.withValues(alpha: AppColors.isDark ? 0.22 : 0.12),
                shape: BoxShape.circle,
              ),
              child: Icon(icon, color: color, size: 22),
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
                          notice.title,
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
                        relativeWhen(notice.createdAt),
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
                          isAdmin
                              ? 'Para: ${notice.audienceLabel} · ${notice.summary}'
                              : notice.summary,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 13,
                            color: AppColors.textSecondary,
                          ),
                        ),
                      ),
                      if (unread)
                        Container(
                          width: 8,
                          height: 8,
                          margin: const EdgeInsets.only(left: 8),
                          decoration: BoxDecoration(
                            color: AppColors.primary,
                            shape: BoxShape.circle,
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
            IconButton(
              tooltip: favorite
                  ? 'Tirar das favoritas'
                  : 'Guardar nas favoritas',
              visualDensity: VisualDensity.compact,
              onPressed: () =>
                  ref.read(favoriteNoticesProvider.notifier).toggle(notice.id),
              icon: Icon(
                favorite ? Icons.star_rounded : Icons.star_outline_rounded,
                color: favorite
                    ? const Color(0xFFF5B301)
                    : AppColors.textSecondary,
                size: 22,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// "10:24" hoje, "Ontem", "3d" na semana, depois a data.
String relativeWhen(String raw) {
  final when = parseServerTime(raw);
  if (when == null) return '';
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final day = DateTime(when.year, when.month, when.day);
  final days = today.difference(day).inDays;
  if (days <= 0) {
    final h = when.hour.toString().padLeft(2, '0');
    final m = when.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }
  if (days == 1) return 'Ontem';
  if (days < 7) return '${days}d';
  return '${when.day.toString().padLeft(2, '0')}/${when.month.toString().padLeft(2, '0')}';
}
