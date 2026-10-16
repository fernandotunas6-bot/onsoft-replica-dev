import 'package:yft_school_system/core/settings/academic_year_state.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/auth/auth_state.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:go_router/go_router.dart';
import 'package:yft_school_system/core/utils/responsive_utils.dart';
import 'package:yft_school_system/core/theme/appearance_state.dart';
import 'package:yft_school_system/core/widgets/app_icons.dart';
import 'package:yft_school_system/core/widgets/app_shell.dart';
import 'package:yft_school_system/core/widgets/profile_photo_avatar.dart';
import 'package:yft_school_system/features/calendar/application/school_events.dart';
import 'package:yft_school_system/features/dashboard/presentation/widgets/home_sections.dart';
import 'package:yft_school_system/features/dashboard/presentation/providers/notices_providers.dart';
import 'package:yft_school_system/core/network/api_client.dart';
import 'package:yft_school_system/core/utils/media_url.dart';

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(authProvider);
    final role = session?.role ?? UserRole.admin;
    final isDesktop = getScreenSize(context) == ScreenSize.desktop;
    final pad = getResponsiveHorizontalPadding(context);

    return AppShell(
      tab: AppTab.home,
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(unreadNoticesCountProvider);
            ref.invalidate(conversationsUnreadProvider);
            ref.invalidate(parentNoticesProvider);
            ref.invalidate(subjectsProvider(null));
            ref.invalidate(academicCalendarProvider);
            ref.invalidate(timetableProvider(null));
            ref.invalidate(myTimetableProvider);
          },
          child: SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: EdgeInsets.fromLTRB(
              pad.left,
              8,
              pad.right,
              isDesktop ? 24 : 32,
            ),
            child: ResponsiveConstrainedContent(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const _HomeHeader(),
                  const SizedBox(height: 20),
                  if (role == UserRole.admin)
                    const AdminDashboard()
                  else if (role == UserRole.teacher)
                    const TeacherDashboard()
                  else
                    const ParentDashboard(),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// "Bem-vindo, Ana!" sobre o fundo escolhido em Aparência, com o sino dos
/// comunicados por ler.
class _HomeHeader extends ConsumerWidget {
  const _HomeHeader();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(authProvider);
    final backdrop = ref.watch(appearanceProvider).backdrop;
    final icons = AppIcons(ref.watch(appearanceProvider).modernIcons);
    // Comunicados e conversas por ler, juntos no sino.
    final unread =
        (ref.watch(unreadNoticesCountProvider).whenOrNull(data: (n) => n) ?? 0) +
        (ref.watch(conversationsUnreadProvider).whenOrNull(data: (n) => n) ?? 0);
    final name = session?.userName ?? 'utilizador';
    final firstName = name.trim().split(RegExp(r'\s+')).first;
    final subtitle = [
      roleLabel(session?.role),
      if (session?.schoolName?.isNotEmpty ?? false) session!.schoolName!,
    ].join(' · ');

    return Container(
      padding: const EdgeInsets.fromLTRB(18, 18, 14, 18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(28),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            for (final c in backdrop.colors)
              c.withValues(alpha: AppColors.isDark ? 0.22 : 0.28),
          ],
        ),
      ),
      child: Row(
        children: [
          ProfilePhotoCircle(
            imageUrl: profilePhotoUrlFromKey(
              session?.photoUrl,
              ref.read(dioProvider).options.baseUrl,
            ),
            radius: 26,
            fallbackLabel: name,
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Bem-vindo, $firstName!',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.displayMedium?.copyWith(
                    fontSize: 22,
                  ),
                ),
                Text(
                  subtitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: 'Mensagens',
            onPressed: () => context.go('/mensagens'),
            icon: Badge(
              isLabelVisible: unread > 0,
              label: Text(unread > 99 ? '99+' : '$unread'),
              backgroundColor: AppColors.error,
              child: Icon(icons.bell, color: AppColors.secondary),
            ),
          ),
        ],
      ),
    );
  }
}

class AdminDashboard extends ConsumerWidget {
  const AdminDashboard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final classesAsync = ref.watch(classesProvider);
    final studentsAsync = ref.watch(
      studentsProvider((classId: null, page: 1)),
    );
    final arrearsAsync = ref.watch(arrearsProvider);
    final currency = ref.watch(academicYearProvider).currency;

    final classCount = classesAsync.whenOrNull(data: (d) => d.length) ?? 0;
    final studentCount =
        studentsAsync.whenOrNull(data: (d) => d.total) ?? 0;
    final arrearsDisplay = arrearsAsync.when(
      data: (d) =>
          '$currency ${d.fold<double>(0, (sum, s) => sum + s.amountOwed).toStringAsFixed(0)}',
      loading: () => '…',
      error: (_, _) => '—',
    );

    return Column(
      children: [
        _SummaryCard(
          title: 'Resumo',
          rows: [
            _SummaryRow(label: 'Total de alunos', value: '$studentCount'),
            _SummaryRow(label: 'Turmas', value: '$classCount'),
            _SummaryRow(
              label: 'Dívidas em atraso',
              value: arrearsDisplay,
            ),
          ],
        ),
        const SizedBox(height: 32),
        ResponsiveGrid(
          mainAxisSpacing: 20,
          crossAxisSpacing: 20,
          children: [
            _ActionCard(
              title: 'Registo de\nprofessores',
              icon: LucideIcons.userPlus,
              color: AppColors.primary,
              onTap: () => context.push('/register-teacher'),
            ),
            _ActionCard(
              title: 'Admissão de\nalunos',
              icon: LucideIcons.graduationCap,
              color: AppColors.surface,
              onTap: () => context.push('/admission'),
            ),
            _ActionCard(
              title: 'Propinas e\nfinanças',
              icon: LucideIcons.wallet,
              color: AppColors.ink,
              isDark: true,
              onTap: () => context.push('/finance'),
            ),
            _ActionCard(
              title: 'Configuração\nacadémica',
              icon: LucideIcons.settings2,
              color: AppColors.surface,
              onTap: () => context.push('/classes'),
            ),
            _ActionCard(
              title: 'Lista de\nalunos',
              icon: LucideIcons.users,
              color: AppColors.primary,
              onTap: () => context.push('/admin-student-classes'),
            ),
            _ActionCard(
              title: 'Disciplinas',
              icon: LucideIcons.book,
              color: AppColors.surface,
              onTap: () => context.push('/subjects'),
            ),
            _ActionCard(
              title: 'Enviar\ncomunicado',
              icon: LucideIcons.send,
              color: AppColors.ink,
              isDark: true,
              onTap: () => context.push('/create-notice'),
            ),
            _ActionCard(
              title: 'Comunicados\nda escola',
              icon: LucideIcons.megaphone,
              color: AppColors.primary,
              onTap: () => context.push('/notices'),
            ),
          ],
        ),
      ],
    );
  }
}

class TeacherDashboard extends ConsumerWidget {
  const TeacherDashboard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Column(
      children: [
        const CurrentClassCard(mine: true),
        const UpcomingActivities(),
        const SizedBox(height: 24),
        ResponsiveGrid(
          mainAxisSpacing: 20,
          crossAxisSpacing: 20,
          children: [
            _ActionCard(
              title: 'Marcar\npresenças',
              icon: LucideIcons.userCheck,
              color: AppColors.surface,
              onTap: () => context.push('/attendance'),
            ),
            _ActionCard(
              title: 'Lista de\nalunos',
              icon: LucideIcons.users,
              color: AppColors.primary,
              onTap: () => context.push('/student-search'),
            ),
            _ActionCard(
              title: 'Total de\npresenças',
              icon: LucideIcons.barChart3,
              color: AppColors.surface,
              onTap: () => context.push('/total-attendance'),
            ),
            _ActionCard(
              title: 'Comunicados\nda escola',
              icon: LucideIcons.megaphone,
              color: AppColors.surface,
              onTap: () => context.push('/notices'),
            ),
          ],
        ),
      ],
    );
  }
}

class ParentDashboard extends ConsumerWidget {
  const ParentDashboard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unreadAsync = ref.watch(unreadNoticesCountProvider);
    final noticeBadge =
        unreadAsync.whenOrNull(data: (n) => n > 0 ? n : null);

    return Column(
      children: [
        const CurrentClassCard(),
        const SubjectsPreview(),
        const SizedBox(height: 16),
        const UpcomingActivities(),
        const SizedBox(height: 24),
        ResponsiveGrid(
          mainAxisSpacing: 20,
          crossAxisSpacing: 20,
          children: [
            _ActionCard(
              title: 'Boletins',
              icon: LucideIcons.scrollText,
              color: AppColors.surface,
              onTap: () => context.push('/result-card'),
            ),
            _ActionCard(
              title: 'Pagamento de\npropinas',
              icon: LucideIcons.creditCard,
              color: AppColors.primary,
              onTap: () => context.push('/payment-history'),
            ),
            _ActionCard(
              title: 'Comunicados\nda escola',
              icon: LucideIcons.megaphone,
              color: AppColors.surface,
              badgeCount: noticeBadge,
              onTap: () => context.push('/notices'),
            ),
            _ActionCard(
              title: 'Mensagens',
              icon: LucideIcons.messageSquare,
              color: AppColors.surface,
              onTap: () => context.go('/mensagens'),
            ),
          ],
        ),
      ],
    );
  }
}

class _SummaryCard extends StatelessWidget {
  final String title;
  final List<Widget> rows;

  const _SummaryCard({required this.title, required this.rows});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: AppColors.primary.withValues(
          alpha: 0.1,
        ), // Subtle lime for background
        borderRadius: BorderRadius.circular(32),
        border: Border.all(color: AppColors.primary.withValues(alpha: 0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 18,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: 16),
              const Icon(LucideIcons.barChart3, size: 20),
            ],
          ),
          const SizedBox(height: 16),
          ...rows,
        ],
      ),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  final String label;
  final String value;

  const _SummaryRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                fontWeight: FontWeight.w600,
                color: AppColors.textSecondary,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          const SizedBox(width: 8),
          Text(
            value,
            style: TextStyle(
              fontWeight: FontWeight.w600,
              color: AppColors.textPrimary,
            ),
          ),
        ],
      ),
    );
  }
}

class _ActionCard extends StatelessWidget {
  final String title;
  final IconData icon;
  final Color color;
  final bool isDark;
  final VoidCallback? onTap;
  /// Unread count badge (parents: school notices). Omit or use 0 to hide.
  final int? badgeCount;

  const _ActionCard({
    required this.title,
    required this.icon,
    required this.color,
    this.isDark = false,
    this.onTap,
    this.badgeCount,
  });

  @override
  Widget build(BuildContext context) {
    final showBadge = badgeCount != null && badgeCount! > 0;
    final onAccent = color == AppColors.primary;
    final fg = isDark
        ? Colors.white
        : onAccent
        ? AppColors.onPrimary
        : AppColors.secondary;
    final label = showBadge && badgeCount! > 99 ? '99+' : '${badgeCount ?? 0}';

    return GestureDetector(
      onTap: onTap,
      child: Stack(
        clipBehavior: Clip.none,
        fit: StackFit.expand,
        children: [
          Container(
            width: double.infinity,
            height: double.infinity,
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(24),
              boxShadow: [
                if (!isDark)
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.03),
                    blurRadius: 20,
                    offset: const Offset(0, 10),
                  ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: isDark || onAccent
                        ? fg.withValues(alpha: 0.16)
                        : AppColors.background,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(
                    icon,
                    color: fg,
                    size: 24,
                  ),
                ),
                Flexible(
                  child: Text(
                    title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: fg,
                      height: 1.2,
                    ),
                  ),
                ),
              ],
            ),
          ),
          if (showBadge)
            Positioned(
              top: 10,
              right: 10,
              child: Container(
                constraints: const BoxConstraints(minWidth: 22, minHeight: 22),
                padding: const EdgeInsets.symmetric(horizontal: 6),
                decoration: BoxDecoration(
                  color: AppColors.error,
                  borderRadius: BorderRadius.circular(11),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.12),
                      blurRadius: 4,
                      offset: const Offset(0, 2),
                    ),
                  ],
                ),
                alignment: Alignment.center,
                child: Text(
                  label,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
