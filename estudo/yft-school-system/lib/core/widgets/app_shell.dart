import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../auth/auth_state.dart';
import '../theme/app_colors.dart';
import '../theme/appearance_state.dart';
import '../utils/responsive_utils.dart';
import 'app_icons.dart';
import 'profile_photo_avatar.dart';
import '../network/api_client.dart';
import '../utils/media_url.dart';

/// Os quatro separadores da barra inferior; "Mais" abre o menu lateral.
enum AppTab { home, subjects, calendar, messages }

extension on AppTab {
  String get route => switch (this) {
    AppTab.home => '/dashboard',
    AppTab.subjects => '/disciplinas',
    AppTab.calendar => '/calendario',
    AppTab.messages => '/mensagens',
  };

  String get label => switch (this) {
    AppTab.home => 'Início',
    AppTab.subjects => 'Disciplinas',
    AppTab.calendar => 'Calendário',
    AppTab.messages => 'Mensagens',
  };

  IconData icon(AppIcons i) => switch (this) {
    AppTab.home => i.home,
    AppTab.subjects => i.subjects,
    AppTab.calendar => i.calendar,
    AppTab.messages => i.messages,
  };
}

String roleLabel(UserRole? role) => switch (role) {
  UserRole.admin => 'Administração',
  UserRole.teacher => 'Professor',
  UserRole.parent => 'Encarregado de educação',
  null => 'Utilizador',
};

/// Estrutura comum dos ecrãs principais: barra inferior no telemóvel, menu
/// fixo à esquerda no ecrã largo, e o menu lateral como gaveta.
class AppShell extends ConsumerWidget {
  final AppTab tab;
  final Widget body;
  final Widget? floatingActionButton;

  const AppShell({
    super.key,
    required this.tab,
    required this.body,
    this.floatingActionButton,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isDesktop = getScreenSize(context) == ScreenSize.desktop;
    final icons = AppIcons(ref.watch(appearanceProvider).modernIcons);

    return Scaffold(
      backgroundColor: AppColors.background,
      drawer: isDesktop ? null : const Drawer(width: 300, child: AppMenu()),
      floatingActionButton: floatingActionButton,
      body: isDesktop
          ? Row(
              children: [
                SizedBox(
                  width: 280,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: AppColors.surface,
                      border: Border(right: BorderSide(color: AppColors.border)),
                    ),
                    child: AppMenu(currentTab: tab),
                  ),
                ),
                Expanded(child: body),
              ],
            )
          : body,
      bottomNavigationBar: isDesktop
          ? null
          : Builder(
              builder: (context) => _BottomBar(
                current: tab,
                icons: icons,
                onMore: () => Scaffold.of(context).openDrawer(),
              ),
            ),
    );
  }
}

class _BottomBar extends StatelessWidget {
  final AppTab current;
  final AppIcons icons;
  final VoidCallback onMore;

  const _BottomBar({
    required this.current,
    required this.icons,
    required this.onMore,
  });

  @override
  Widget build(BuildContext context) {
    Widget item(IconData icon, String label, bool selected, VoidCallback onTap) {
      final color = selected ? AppColors.primary : AppColors.textSecondary;
      return Expanded(
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: 22, color: color),
                const SizedBox(height: 4),
                Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 11,
                    color: color,
                    fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            for (final t in AppTab.values)
              item(t.icon(icons), t.label, t == current, () {
                if (t != current) context.go(t.route);
              }),
            item(icons.more, 'Mais', false, onMore),
          ],
        ),
      ),
    );
  }
}

/// Uma entrada do menu lateral.
class _MenuEntry {
  final IconData icon;
  final String label;
  final String route;

  const _MenuEntry(this.icon, this.label, this.route);
}

List<_MenuEntry> _entriesFor(UserRole? role, AppIcons i) {
  return [
    _MenuEntry(i.profile, 'Meu perfil', '/personal-info'),
    if (role == UserRole.parent) ...[
      _MenuEntry(i.wards, 'Educandos', '/wards'),
      _MenuEntry(i.grades, 'Notas', '/result-card'),
      _MenuEntry(i.absences, 'Faltas', '/ward-attendance'),
      _MenuEntry(i.fees, 'Propinas', '/payment-history'),
      _MenuEntry(i.receipts, 'Recibos', '/parent-receipts'),
    ],
    if (role == UserRole.teacher) ...[
      _MenuEntry(i.classes, 'As minhas turmas', '/my-classes'),
      _MenuEntry(i.attendance, 'Marcar presenças', '/attendance'),
      _MenuEntry(i.absences, 'Faltas', '/total-attendance'),
      _MenuEntry(i.grades, 'Notas', '/results-setup'),
    ],
    if (role == UserRole.admin) ...[
      _MenuEntry(i.teachers, 'Professores', '/teachers'),
      _MenuEntry(i.students, 'Alunos', '/admin-student-classes'),
      _MenuEntry(i.classes, 'Turmas', '/classes'),
      _MenuEntry(i.grades, 'Notas', '/results-setup'),
      _MenuEntry(i.absences, 'Faltas', '/total-attendance'),
      _MenuEntry(i.fees, 'Propinas', '/finance'),
      _MenuEntry(i.receipts, 'Pagamentos', '/students-finance'),
    ],
    _MenuEntry(i.academicCalendar, 'Calendário académico', '/academic-calendar'),
    _MenuEntry(i.settings, 'Definições', '/profile'),
    _MenuEntry(i.appearance, 'Aparência', '/aparencia'),
    _MenuEntry(i.help, 'Ajuda e apoio', '/help-support'),
  ];
}

/// Menu lateral: perfil no topo, atalhos por papel, modo escuro e sair.
/// Com [currentTab], é o menu fixo do ecrã largo e mostra também os
/// separadores que no telemóvel vivem na barra inferior.
class AppMenu extends ConsumerWidget {
  final AppTab? currentTab;

  const AppMenu({super.key, this.currentTab});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(authProvider);
    final appearance = ref.watch(appearanceProvider);
    final icons = AppIcons(appearance.modernIcons);
    final inDrawer = currentTab == null;

    void open(String route) {
      if (inDrawer) Navigator.of(context).pop();
      context.push(route);
    }

    Widget tile(IconData icon, String label, VoidCallback onTap,
        {bool selected = false, Color? color, Widget? trailing}) {
      final fg = color ?? (selected ? AppColors.primary : AppColors.textPrimary);
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
        child: Material(
          color: selected
              ? AppColors.primary.withValues(alpha: 0.10)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(14),
          child: InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              child: Row(
                children: [
                  Icon(icon, size: 20, color: fg),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Text(
                      label,
                      style: TextStyle(
                        fontSize: 15,
                        color: fg,
                        fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
                      ),
                    ),
                  ),
                  trailing ??
                      Icon(Icons.chevron_right_rounded,
                          size: 20, color: AppColors.textSecondary),
                ],
              ),
            ),
          ),
        ),
      );
    }

    final name = session?.userName ?? 'Utilizador';
    final subtitle = [
      roleLabel(session?.role),
      if (session?.schoolName?.isNotEmpty ?? false) session!.schoolName!,
    ].join(' · ');

    return SafeArea(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 24, 24, 16),
            child: Row(
              children: [
                ProfilePhotoCircle(
                  imageUrl: profilePhotoUrlFromKey(
                    session?.photoUrl,
                    ref.read(dioProvider).options.baseUrl,
                  ),
                  radius: 24,
                  fallbackLabel: name,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: AppColors.textPrimary,
                        ),
                      ),
                      Text(
                        subtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 12,
                          color: AppColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Divider(height: 1, color: AppColors.border),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.symmetric(vertical: 12),
              children: [
                if (!inDrawer) ...[
                  for (final t in AppTab.values)
                    tile(
                      t.icon(icons),
                      t.label,
                      () => context.go(t.route),
                      selected: t == currentTab,
                      trailing: const SizedBox.shrink(),
                    ),
                  Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 24,
                      vertical: 8,
                    ),
                    child: Divider(height: 1, color: AppColors.border),
                  ),
                ],
                for (final e in _entriesFor(session?.role, icons))
                  tile(e.icon, e.label, () => open(e.route)),
                tile(
                  icons.dark,
                  'Modo escuro',
                  () => ref
                      .read(appearanceProvider.notifier)
                      .setDark(!AppColors.isDark),
                  trailing: Switch(
                    value: AppColors.isDark,
                    onChanged: (v) =>
                        ref.read(appearanceProvider.notifier).setDark(v),
                  ),
                ),
              ],
            ),
          ),
          Divider(height: 1, color: AppColors.border),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: tile(
              icons.logout,
              'Sair',
              () async {
                if (inDrawer) Navigator.of(context).pop();
                await ref.read(authProvider.notifier).logout();
                if (context.mounted) context.go('/login');
              },
              color: AppColors.error,
              trailing: const SizedBox.shrink(),
            ),
          ),
        ],
      ),
    );
  }
}
