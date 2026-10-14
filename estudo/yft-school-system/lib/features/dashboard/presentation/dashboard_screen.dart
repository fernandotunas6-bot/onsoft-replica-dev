import 'package:yft_school_system/core/settings/academic_year_state.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/auth/auth_state.dart';
import 'package:yft_school_system/core/network/api_client.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:go_router/go_router.dart';
import 'package:yft_school_system/features/academics/application/academic_state.dart';
import 'package:yft_school_system/core/utils/responsive_utils.dart';
import 'package:yft_school_system/core/widgets/profile_photo_avatar.dart';
import 'package:yft_school_system/features/dashboard/presentation/providers/notices_providers.dart';

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(authProvider);
    final role = session?.role ?? UserRole.admin;
    final isDesktop = getScreenSize(context) == ScreenSize.desktop;

    final bodyContent = Builder(
      builder: (context) => SafeArea(
        child: Column(
          children: [
            // Sticky Header
            _buildHeader(context, session),
            // Scrollable Content
            Expanded(
              child: SingleChildScrollView(
                padding: EdgeInsets.fromLTRB(
                  getResponsiveHorizontalPadding(context).left,
                  16,
                  getResponsiveHorizontalPadding(context).right,
                  isDesktop ? 24 : MediaQuery.of(context).padding.bottom + 120,
                ),
                child: ResponsiveConstrainedContent(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
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
          ],
        ),
      ),
    );

    return Scaffold(
      backgroundColor: AppColors.background,
      body: isDesktop
          ? Row(
              children: [
                _buildSideNav(context, role),
                Expanded(child: bodyContent),
              ],
            )
          : bodyContent,
      bottomNavigationBar: isDesktop ? null : _buildBottomNav(context, role),
    );
  }

  Widget _buildSideNav(BuildContext context, UserRole role) {
    final items = _getNavItems(role);
    return Consumer(builder: (context, ref, _) {
    final session = ref.watch(authProvider);
    final schoolName = session?.schoolName ?? 'Edu Manager';
    final logoUrl = session?.schoolLogoUrl;
    final workerBase = ref.read(dioProvider).options.baseUrl;

    return Container(
      width: 280,
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border(
          right: BorderSide(color: Colors.black.withValues(alpha: 0.05)),
        ),
      ),
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.all(24.0),
              child: Row(
                children: [
                  if (logoUrl != null && logoUrl.isNotEmpty)
                    GestureDetector(
                      onTap: () => showFullscreenNetworkImage(
                        context,
                        '$workerBase/media/$logoUrl',
                      ),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(10),
                        child: Image.network(
                          '$workerBase/media/$logoUrl',
                          width: 40,
                          height: 40,
                          fit: BoxFit.contain,
                          errorBuilder: (_, e, s) => _defaultLogoIcon(),
                        ),
                      ),
                    )
                  else
                    _defaultLogoIcon(),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      schoolName,
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w900,
                        color: AppColors.secondary,
                        letterSpacing: -0.5,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            // Navigation Items
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: items.length,
                itemBuilder: (context, index) {
                  final item = items[index];
                  final isSelected =
                      index ==
                      0; // Home is default selected for now in dashboard
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 8.0),
                    child: InkWell(
                      onTap: () {
                        if (index == 0) return; // Home
                        final label = item.label;
                        if (label == 'Staff') {
                          context.push('/teachers');
                        } else if (label == 'Classes') {
                          context.push('/my-classes');
                        } else if (label == 'Wards') {
                          context.push('/wards');
                        } else if (label == 'Receipts') {
                          context.push('/parent-receipts');
                        } else if (label == 'Results') {
                          context.push('/results-setup');
                        } else if (label == 'Profile') {
                          context.push('/profile');
                        }
                      },
                      borderRadius: BorderRadius.circular(12),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        padding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 14,
                        ),
                        decoration: BoxDecoration(
                          color: isSelected
                              ? AppColors.primary
                              : Colors.transparent,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Row(
                          children: [
                            IconTheme(
                              data: IconThemeData(
                                color: isSelected
                                    ? Colors.white
                                    : AppColors.textSecondary,
                                size: 20,
                              ),
                              child: item.icon,
                            ),
                            const SizedBox(width: 16),
                            Text(
                              item.label ?? '',
                              style: TextStyle(
                                color: isSelected
                                    ? Colors.white
                                    : AppColors.textSecondary,
                                fontWeight: isSelected
                                    ? FontWeight.w600
                                    : FontWeight.w500,
                                fontSize: 15,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
            // Sidebar Footer / Profile summary
            Padding(
              padding: EdgeInsets.fromLTRB(
                24,
                24,
                24,
                MediaQuery.of(context).padding.bottom + 24,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'SYSTEM',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                      color: AppColors.textSecondary,
                      letterSpacing: 1.2,
                    ),
                  ),
                  const SizedBox(height: 12),
                  InkWell(
                    onTap: () => context.push('/help-support'),
                    child: Row(
                      children: [
                        const Icon(
                          LucideIcons.lifeBuoy,
                          size: 20,
                          color: AppColors.textSecondary,
                        ),
                        const SizedBox(width: 16),
                        const Text(
                          'Help & Support',
                          style: TextStyle(
                            fontWeight: FontWeight.w500,
                            color: AppColors.textSecondary,
                            fontSize: 15,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),
                  Row(
                    children: [
                      CircleAvatar(
                        radius: 20,
                        backgroundColor: AppColors.primary.withValues(
                          alpha: 0.1,
                        ),
                        child: const Icon(
                          LucideIcons.user,
                          color: AppColors.primary,
                          size: 20,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'My Account',
                              style: TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 14,
                                color: AppColors.textPrimary,
                              ),
                            ),
                            Text(
                              _getSubtitle(role),
                              style: const TextStyle(
                                fontSize: 12,
                                color: AppColors.textSecondary,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                        ),
                      ),
                      const Icon(
                        LucideIcons.logOut,
                        size: 20,
                        color: Colors.red,
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
    });
  }

  static Widget _defaultLogoIcon() {
    return Container(
      width: 40,
      height: 40,
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: AppColors.primary,
        borderRadius: BorderRadius.circular(10),
      ),
      child: const Icon(
        LucideIcons.graduationCap,
        color: Colors.white,
        size: 24,
      ),
    );
  }

  Widget _buildHeader(BuildContext context, AppSession? session) {
    final isDesktop = getScreenSize(context) == ScreenSize.desktop;

    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: getResponsiveHorizontalPadding(context).left,
        vertical: 16,
      ),
      decoration: BoxDecoration(
        color: AppColors.background,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.03),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
              Expanded(
            child: Row(
              children: [
                if (!isDesktop) ...[
                  Consumer(builder: (context, ref, _) {
                    final session = ref.watch(authProvider);
                    final logoUrl = session?.schoolLogoUrl;
                    final workerBase = ref.read(dioProvider).options.baseUrl;
                    if (logoUrl != null && logoUrl.isNotEmpty) {
                      final logoUri = '$workerBase/media/$logoUrl';
                      return GestureDetector(
                        onTap: () =>
                            showFullscreenNetworkImage(context, logoUri),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: Image.network(
                            logoUri,
                            width: 36,
                            height: 36,
                            fit: BoxFit.contain,
                            errorBuilder: (_, e, s) => Container(
                              width: 36,
                              height: 36,
                              decoration: BoxDecoration(
                                color: AppColors.primary,
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: const Icon(LucideIcons.graduationCap,
                                  color: Colors.white, size: 20),
                            ),
                          ),
                        ),
                      );
                    }
                    return Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        color: AppColors.primary,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Icon(LucideIcons.graduationCap,
                          color: Colors.white, size: 20),
                    );
                  }),
                  const SizedBox(width: 8),
                ],
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Hi! ${session?.userName ?? "User"}',
                        style: Theme.of(context).textTheme.displayMedium,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      Text(
                        _getSubtitle(session?.role),
                        style: Theme.of(context).textTheme.bodyMedium,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          if (isDesktop) ...[
            const SizedBox(width: 40),
            Expanded(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 400),
                child: TextField(
                  decoration: InputDecoration(
                    hintText: 'Search everything...',
                    prefixIcon: const Icon(LucideIcons.search, size: 18),
                    filled: true,
                    fillColor: AppColors.surface,
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 12,
                    ),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide.none,
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 40),
          ],
          Row(
            children: [
              GestureDetector(
                onTap: () => context.push('/notifications-settings'),
                child: Container(
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: Colors.black.withValues(alpha: 0.05),
                    ),
                  ),
                  padding: const EdgeInsets.all(10),
                  child: const Badge(
                    child: Icon(
                      LucideIcons.bell,
                      color: AppColors.secondary,
                      size: 20,
                    ),
                  ),
                ),
              ),
              if (isDesktop) ...[
                const SizedBox(width: 16),
                CircleAvatar(
                  radius: 20,
                  backgroundColor: AppColors.primary.withValues(alpha: 0.1),
                  child: const Icon(LucideIcons.user, color: AppColors.primary),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }

  String _getSubtitle(UserRole? role) {
    switch (role) {
      case UserRole.admin:
        return 'School Administrator';
      case UserRole.teacher:
        return 'Class Instructor';
      case UserRole.parent:
        return 'Parent Account';
      default:
        return 'User';
    }
  }

  Widget _buildBottomNav(BuildContext context, UserRole role) {
    return BottomNavigationBar(
      type: BottomNavigationBarType.fixed,
      backgroundColor: AppColors.surface,
      selectedItemColor: AppColors.primary,
      unselectedItemColor: AppColors.textSecondary,
      onTap: (index) {
        if (index == 0) return; // Home
        final items = _getNavItems(role);
        if (index >= items.length) return;

        final label = items[index].label;
        if (label == 'Staff') {
          context.push('/teachers');
        } else if (label == 'Classes') {
          context.push('/my-classes');
        } else if (label == 'Wards') {
          context.push('/wards');
        } else if (label == 'Receipts') {
          context.push('/parent-receipts');
        } else if (label == 'Results') {
          context.push('/results-setup');
        } else if (label == 'Profile') {
          context.push('/profile');
        }
      },
      items: _getNavItems(role),
    );
  }

  List<BottomNavigationBarItem> _getNavItems(UserRole role) {
    return [
      const BottomNavigationBarItem(
        icon: Icon(LucideIcons.home),
        label: 'Home',
      ),
      if (role == UserRole.admin)
        const BottomNavigationBarItem(
          icon: Icon(LucideIcons.users),
          label: 'Staff',
        ),
      if (role == UserRole.teacher)
        const BottomNavigationBarItem(
          icon: Icon(LucideIcons.bookOpen),
          label: 'Classes',
        ),
      if (role == UserRole.parent)
        const BottomNavigationBarItem(
          icon: Icon(LucideIcons.baby),
          label: 'Wards',
        ),
      if (role == UserRole.parent)
        const BottomNavigationBarItem(
          icon: Icon(LucideIcons.receipt),
          label: 'Receipts',
        ),
      if (role == UserRole.admin || role == UserRole.teacher)
        const BottomNavigationBarItem(
          icon: Icon(LucideIcons.clipboardList),
          label: 'Results',
        ),
      const BottomNavigationBarItem(
        icon: Icon(LucideIcons.userCircle),
        label: 'Profile',
      ),
    ];
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
          title: 'Ecosystem Summary',
          rows: [
            _SummaryRow(label: 'Total Students', value: '$studentCount'),
            _SummaryRow(label: 'Classes', value: '$classCount'),
            _SummaryRow(
              label: 'Total Arrears',
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
              title: 'Teacher\nRegistration',
              icon: LucideIcons.userPlus,
              color: AppColors.primary,
              onTap: () => context.push('/register-teacher'),
            ),
            _ActionCard(
              title: 'Student\nAdmissions',
              icon: LucideIcons.graduationCap,
              color: AppColors.surface,
              onTap: () => context.push('/admission'),
            ),
            _ActionCard(
              title: 'Finance\n& Fees',
              icon: LucideIcons.wallet,
              color: AppColors.secondary,
              isDark: true,
              onTap: () => context.push('/finance'),
            ),
            _ActionCard(
              title: 'Academic\nSetup',
              icon: LucideIcons.settings2,
              color: AppColors.surface,
              onTap: () => context.push('/classes'),
            ),
            _ActionCard(
              title: 'Students\nDirectory',
              icon: LucideIcons.users,
              color: AppColors.primary,
              onTap: () => context.push('/admin-student-classes'),
            ),
            _ActionCard(
              title: 'Subjects\nSetup',
              icon: LucideIcons.book,
              color: AppColors.surface,
              onTap: () => context.push('/subjects'),
            ),
            _ActionCard(
              title: 'Send\nNotice',
              icon: LucideIcons.send,
              color: AppColors.secondary,
              isDark: true,
              onTap: () => context.push('/create-notice'),
            ),
            _ActionCard(
              title: 'School\nNotices',
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
    final selectedClass = ref.watch(selectedClassProvider);

    return Column(
      children: [
        _SummaryCard(
          title: '${selectedClass?.className ?? "Class"} Summary',
          rows: [
            const _SummaryRow(label: 'Welcome', value: 'Dashboard'),
          ],
        ),
        const SizedBox(height: 32),
        ResponsiveGrid(
          mainAxisSpacing: 20,
          crossAxisSpacing: 20,
          children: [
            _ActionCard(
              title: 'Take\nAttendance',
              icon: LucideIcons.userCheck,
              color: AppColors.surface,
              onTap: () => context.push('/attendance'),
            ),
            _ActionCard(
              title: 'Students\nDirectory',
              icon: LucideIcons.users,
              color: AppColors.primary,
              onTap: () => context.push('/student-search'),
            ),
            _ActionCard(
              title: 'Total\nAttendance',
              icon: LucideIcons.barChart3,
              color: AppColors.surface,
              onTap: () => context.push('/total-attendance'),
            ),
            _ActionCard(
              title: 'School\nNotices',
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
        _SummaryCard(
          title: 'Ward Overview',
          rows: [
            const _SummaryRow(label: 'Welcome', value: 'Dashboard'),
          ],
        ),
        const SizedBox(height: 32),
        ResponsiveGrid(
          mainAxisSpacing: 20,
          crossAxisSpacing: 20,
          children: [
            _ActionCard(
              title: 'Report\nCards',
              icon: LucideIcons.scrollText,
              color: AppColors.surface,
              onTap: () => context.push('/result-card'),
            ),
            _ActionCard(
              title: 'Fee\nPayment',
              icon: LucideIcons.creditCard,
              color: AppColors.primary,
              onTap: () => context.push('/payment-history'),
            ),
            _ActionCard(
              title: 'School\nNotices',
              icon: LucideIcons.megaphone,
              color: AppColors.surface,
              badgeCount: noticeBadge,
              onTap: () => context.push('/notices'),
            ),
            _ActionCard(
              title: 'Messages',
              icon: LucideIcons.messageSquare,
              color: AppColors.surface,
              onTap: () {},
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
                    fontWeight: FontWeight.bold,
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
              style: const TextStyle(
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
            style: const TextStyle(
              fontWeight: FontWeight.bold,
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
                    color: isDark
                        ? AppColors.primary.withValues(alpha: 0.2)
                        : AppColors.background,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(
                    icon,
                    color: isDark ? AppColors.primary : AppColors.secondary,
                    size: 24,
                  ),
                ),
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.bold,
                    color: isDark ? Colors.white : AppColors.secondary,
                    height: 1.2,
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
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
