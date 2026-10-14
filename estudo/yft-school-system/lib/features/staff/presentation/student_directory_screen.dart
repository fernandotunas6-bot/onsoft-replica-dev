import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/models/student.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';
import 'package:yft_school_system/core/settings/academic_year_state.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:go_router/go_router.dart';
import 'package:yft_school_system/core/utils/responsive_utils.dart';

class StudentDirectoryScreen extends ConsumerStatefulWidget {
  const StudentDirectoryScreen({super.key});

  @override
  ConsumerState<StudentDirectoryScreen> createState() =>
      _StudentDirectoryScreenState();
}

class _StudentDirectoryScreenState
    extends ConsumerState<StudentDirectoryScreen> {
  final _searchController = TextEditingController();
  String? _selectedClassId;
  int _currentPage = 1;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  List<Student> _filterStudents(List<Student> students) {
    final q = _searchController.text.trim().toLowerCase();
    if (q.isEmpty) return students;
    return students
        .where((s) =>
            s.name.toLowerCase().contains(q) ||
            s.id.toLowerCase().contains(q))
        .toList();
  }

  String _initials(Student student) {
    final n = student.name;
    if (n.length >= 2) return n.substring(0, 2).toUpperCase();
    if (n.isEmpty) return '?';
    return n[0].toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final classesAsync = ref.watch(classesProvider);
    final studentsAsync = ref.watch(
      studentsProvider((classId: _selectedClassId, page: _currentPage)),
    );
    final currency = ref.watch(academicYearProvider).currency;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text(
          'Student Directory',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: AppColors.secondary,
      ),
      body: Column(
        children: [
          _buildFilters(context, classesAsync),
          Expanded(
            child: studentsAsync.when(
              loading: () =>
                  const Center(child: CircularProgressIndicator()),
              error: (error, _) => Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(LucideIcons.alertTriangle,
                        size: 48, color: AppColors.error),
                    const SizedBox(height: 16),
                    const Text('Failed to load students'),
                    const SizedBox(height: 16),
                    ElevatedButton(
                      onPressed: () => ref.invalidate(studentsProvider(
                          (classId: _selectedClassId, page: _currentPage))),
                      child: const Text('Retry'),
                    ),
                  ],
                ),
              ),
              data: (paginated) {
                final students = paginated.data;
                if (students.isEmpty) {
                  return Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(LucideIcons.graduationCap,
                            size: 56,
                            color: AppColors.textSecondary
                                .withValues(alpha: 0.3)),
                        const SizedBox(height: 16),
                        const Text(
                          'No students found.',
                          style: TextStyle(
                              color: AppColors.textSecondary, fontSize: 14),
                        ),
                      ],
                    ),
                  );
                }

                final visible = _filterStudents(students);
                if (visible.isEmpty) {
                  return Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(LucideIcons.search,
                            size: 56,
                            color: AppColors.textSecondary
                                .withValues(alpha: 0.3)),
                        const SizedBox(height: 16),
                        const Text(
                          'No matches for your search.',
                          style: TextStyle(
                              color: AppColors.textSecondary, fontSize: 14),
                        ),
                      ],
                    ),
                  );
                }

                return RefreshIndicator(
                  onRefresh: () async => ref.invalidate(studentsProvider(
                      (classId: _selectedClassId, page: _currentPage))),
                  child: CustomScrollView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    slivers: [
                      SliverPadding(
                        padding: getResponsiveHorizontalPadding(context)
                            .copyWith(top: 8, bottom: 120),
                        sliver: SliverList(
                        delegate: SliverChildBuilderDelegate(
                          (context, index) {
                            final student = visible[index];
                            final balanceText = student.hasDebt
                                ? '$currency ${student.balance.abs().toStringAsFixed(2)}'
                                : student.isOverpaid
                                    ? '+$currency ${student.balance.toStringAsFixed(2)}'
                                    : 'Cleared';
                            final balanceColor = student.hasDebt
                                ? Colors.red.shade700
                                : student.isOverpaid
                                    ? Colors.green.shade700
                                    : AppColors.textSecondary;

                            return Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Material(
                              color: AppColors.background,
                              child: InkWell(
                                onTap: () => context.push(
                                    '/student-details/${student.id}'),
                                child: ListTile(
                                    contentPadding: const EdgeInsets
                                        .symmetric(horizontal: 4),
                                    leading: CircleAvatar(
                                      radius: 22,
                                      backgroundColor: AppColors.primary
                                          .withValues(alpha: 0.12),
                                      child: Text(
                                        _initials(student),
                                        style: const TextStyle(
                                          color: AppColors.secondary,
                                          fontWeight: FontWeight.bold,
                                          fontSize: 13,
                                        ),
                                      ),
                                    ),
                                    title: Text(
                                      student.name,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w600,
                                        fontSize: 16,
                                      ),
                                    ),
                                    subtitle: Text(
                                      '${student.id} • ${student.className ?? student.classId}',
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                        fontSize: 13,
                                        color: AppColors.textSecondary,
                                      ),
                                    ),
                                    trailing: ConstrainedBox(
                                      constraints: const BoxConstraints(
                                          maxWidth: 110),
                                      child: Text(
                                        balanceText,
                                        textAlign: TextAlign.end,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: TextStyle(
                                          fontWeight: FontWeight.w600,
                                          fontSize: 14,
                                          color: balanceColor,
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                                if (index < visible.length - 1)
                                  const Divider(
                                    height: 1,
                                    thickness: 1,
                                    indent: 64,
                                  ),
                              ],
                            );
                          },
                          childCount: visible.length,
                        ),
                      ),
                      ),
                      if (paginated.totalPages > 1)
                        SliverToBoxAdapter(
                          child: Padding(
                            padding: const EdgeInsets.only(top: 20, bottom: 8),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                if (_currentPage > 1)
                                  TextButton(
                                    onPressed: () => setState(
                                        () => _currentPage--),
                                    child: const Text('Previous'),
                                  ),
                                Padding(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 16),
                                  child: Text(
                                    'Page $_currentPage of ${paginated.totalPages}',
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w600),
                                  ),
                                ),
                                if (paginated.hasNextPage)
                                  TextButton(
                                    onPressed: () => setState(
                                        () => _currentPage++),
                                    child: const Text('Next'),
                                  ),
                              ],
                            ),
                          ),
                        ),
                    ],
                  ),
                );
              },
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/admission'),
        backgroundColor: AppColors.primary,
        icon: const Icon(LucideIcons.userPlus, color: Colors.white),
        label: const Text(
          'New Admission',
          style: TextStyle(color: Colors.white),
        ),
      ),
    );
  }

  Widget _buildFilters(BuildContext context, AsyncValue classesAsync) {
    return Container(
      padding: getResponsiveHorizontalPadding(context)
          .copyWith(top: 16, bottom: 16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.03),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: ResponsiveConstrainedContent(
        child: Row(
          children: [
            Expanded(
              flex: 2,
              child: TextField(
                controller: _searchController,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(
                  hintText: 'Search ID or name…',
                  prefixIcon: const Icon(LucideIcons.search, size: 20),
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 16),
                  filled: true,
                  fillColor: AppColors.background,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide.none,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                decoration: BoxDecoration(
                  color: AppColors.background,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: classesAsync.when(
                  loading: () => const SizedBox(
                    height: 48,
                    child: Center(
                        child: SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                                strokeWidth: 2))),
                  ),
                  error: (_, _) =>
                      const Text('Error', style: TextStyle(fontSize: 12)),
                  data: (classes) => DropdownButtonHideUnderline(
                    child: DropdownButton<String?>(
                      value: _selectedClassId,
                      hint: const Text('All classes',
                          style: TextStyle(fontSize: 14)),
                      isExpanded: true,
                      items: [
                        const DropdownMenuItem<String?>(
                          value: null,
                          child: Text('All classes'),
                        ),
                        ...classes.map(
                          (c) => DropdownMenuItem<String?>(
                            value: c.id,
                            child: Text(c.className),
                          ),
                        ),
                      ],
                      onChanged: (val) => setState(() {
                        _selectedClassId = val;
                        _currentPage = 1;
                      }),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
