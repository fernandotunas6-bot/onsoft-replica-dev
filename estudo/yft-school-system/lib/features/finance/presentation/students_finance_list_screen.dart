import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';
import 'package:yft_school_system/core/settings/academic_year_state.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/models/student.dart';

class StudentsFinanceListScreen extends ConsumerStatefulWidget {
  const StudentsFinanceListScreen({super.key});

  @override
  ConsumerState<StudentsFinanceListScreen> createState() =>
      _StudentsFinanceListScreenState();
}

class _StudentsFinanceListScreenState
    extends ConsumerState<StudentsFinanceListScreen> {
  String _filter = 'All';
  String _classFilter = 'All Classes';
  String _searchQuery = '';
  final TextEditingController _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  String _statusOf(Student s) {
    if (s.balance < 0) return 'Owing';
    if (s.balance > 0) return 'Credit';
    return 'Paid';
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'Owing':
        return AppColors.error;
      case 'Paid':
        return Colors.green;
      case 'Credit':
        return Colors.blue.shade700;
      default:
        return AppColors.textSecondary;
    }
  }

  String _balanceLine(Student student, String currency) {
    if (student.balance < 0) {
      return '$currency ${student.balance.abs().toStringAsFixed(2)} owing';
    }
    if (student.balance > 0) {
      return '$currency ${student.balance.toStringAsFixed(2)} credit';
    }
    return '$currency 0.00';
  }

  @override
  Widget build(BuildContext context) {
    final studentsAsync =
        ref.watch(studentsProvider((classId: null, page: 1)));
    final classesAsync = ref.watch(classesProvider);
    final currency = ref.watch(academicYearProvider).currency;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text(
          'All Students Finance',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: AppColors.secondary,
      ),
      body: studentsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('Failed to load students',
                  style: TextStyle(color: AppColors.error)),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => ref.invalidate(
                    studentsProvider((classId: null, page: 1))),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
        data: (paginated) {
          final allStudents = paginated.data;
          final classNames = classesAsync.whenOrNull(
                  data: (classes) =>
                      Map.fromEntries(classes.map((c) => MapEntry(c.id, c.className)))) ??
              {};

          final filteredList = allStudents.where((s) {
            final status = _statusOf(s);
            final matchesStatus = _filter == 'All' || _filter == status;
            final displayClass = s.className ?? classNames[s.classId] ?? '';
            final matchesClass =
                _classFilter == 'All Classes' || displayClass == _classFilter;
            final matchesSearch =
                s.name.toLowerCase().contains(_searchQuery.toLowerCase());
            return matchesStatus && matchesClass && matchesSearch;
          }).toList();

          final classSet = <String>{'All Classes'};
          for (final s in allStudents) {
            final cn = s.className ?? classNames[s.classId] ?? '';
            if (cn.isNotEmpty) classSet.add(cn);
          }
          final classes = classSet.toList();

          return Column(
            children: [
              Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 24.0, vertical: 8.0),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _searchController,
                        decoration: InputDecoration(
                          hintText: 'Search student...',
                          prefixIcon: const Icon(Icons.search, size: 20),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: BorderSide(
                                color:
                                    AppColors.primary.withValues(alpha: 0.3)),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: BorderSide(
                                color:
                                    AppColors.primary.withValues(alpha: 0.3)),
                          ),
                          contentPadding:
                              const EdgeInsets.symmetric(vertical: 0),
                        ),
                        onChanged: (val) =>
                            setState(() => _searchQuery = val),
                      ),
                    ),
                    const SizedBox(width: 16),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      decoration: BoxDecoration(
                        border: Border.all(
                            color: AppColors.primary.withValues(alpha: 0.3)),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: DropdownButton<String>(
                        value: classes.contains(_classFilter)
                            ? _classFilter
                            : 'All Classes',
                        items: classes.map((c) {
                          return DropdownMenuItem(value: c, child: Text(c));
                        }).toList(),
                        onChanged: (val) {
                          if (val != null) {
                            setState(() => _classFilter = val);
                          }
                        },
                        underline: const SizedBox(),
                        icon: const Icon(Icons.arrow_drop_down,
                            color: AppColors.primary),
                      ),
                    ),
                  ],
                ),
              ),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                padding:
                    const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
                child: Row(
                  children: ['All', 'Paid', 'Credit', 'Owing'].map((filter) {
                    final isSelected = _filter == filter;
                    return Padding(
                      padding: const EdgeInsets.only(right: 8.0),
                      child: ChoiceChip(
                        label: Text(filter),
                        selected: isSelected,
                        onSelected: (selected) {
                          if (selected) setState(() => _filter = filter);
                        },
                        selectedColor: AppColors.primary,
                        labelStyle: TextStyle(
                          color: isSelected
                              ? Colors.white
                              : AppColors.textSecondary,
                          fontWeight: isSelected
                              ? FontWeight.bold
                              : FontWeight.normal,
                        ),
                        backgroundColor: AppColors.surface,
                      ),
                    );
                  }).toList(),
                ),
              ),
              if (filteredList.isEmpty)
                const Expanded(
                  child: Center(
                    child: Text('No students found',
                        style: TextStyle(color: AppColors.textSecondary)),
                  ),
                )
              else
                Expanded(
                  child: ListView.builder(
                    padding: const EdgeInsets.all(24),
                    itemCount: filteredList.length,
                    itemBuilder: (context, index) {
                      final student = filteredList[index];
                      final displayClass = student.className ??
                          classNames[student.classId] ??
                          '';
                      return _buildStudentCard(
                          context, student, displayClass, currency);
                    },
                  ),
                ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildStudentCard(
    BuildContext context,
    Student student,
    String displayClass,
    String currency,
  ) {
    final status = _statusOf(student);
    final statusColor = _statusColor(status);
    final displayAmount = _balanceLine(student, currency);

    return InkWell(
      onTap: () =>
          _showStudentFinanceDetails(context, student, displayClass, currency),
      borderRadius: BorderRadius.circular(20),
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(20),
          border:
              Border.all(color: AppColors.primary.withValues(alpha: 0.1)),
        ),
        child: Row(
          children: [
            CircleAvatar(
              backgroundColor: AppColors.primary.withValues(alpha: 0.1),
              child: Text(
                student.name.isNotEmpty ? student.name[0] : '?',
                style: const TextStyle(
                    color: AppColors.secondary, fontWeight: FontWeight.bold),
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(student.name,
                      style: const TextStyle(fontWeight: FontWeight.bold)),
                  Text(displayClass,
                      style: TextStyle(
                          color: AppColors.textSecondary, fontSize: 12)),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(displayAmount,
                    style: const TextStyle(fontWeight: FontWeight.bold)),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    status,
                    style: TextStyle(
                        color: statusColor,
                        fontSize: 11,
                        fontWeight: FontWeight.bold),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  void _showStudentFinanceDetails(
    BuildContext context,
    Student student,
    String displayClass,
    String currency,
  ) {
    final status = _statusOf(student);
    final statusColor = _statusColor(status);
    final displayAmount = _balanceLine(student, currency);

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => Container(
        decoration: const BoxDecoration(
          color: AppColors.background,
          borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
        ),
        padding: EdgeInsets.fromLTRB(
            32, 32, 32, MediaQuery.of(context).padding.bottom + 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Text(
                    'Finance Details - ${student.name}',
                    style: const TextStyle(
                        fontSize: 20, fontWeight: FontWeight.bold),
                  ),
                ),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    status,
                    style: TextStyle(
                        color: statusColor,
                        fontWeight: FontWeight.bold,
                        fontSize: 12),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),
            _buildDetailRow('Class', displayClass),
            const SizedBox(height: 16),
            _buildDetailRow('Balance', displayAmount),
            const SizedBox(height: 16),
            if (student.parentName != null) ...[
              _buildDetailRow('Parent', student.parentName!),
              const SizedBox(height: 16),
            ],
            if (student.parentPhone != null) ...[
              _buildDetailRow('Parent Phone', student.parentPhone!),
              const SizedBox(height: 16),
            ],
            const SizedBox(height: 16),
            if (student.balance < 0)
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: () {
                    Navigator.pop(context);
                    context.push(
                      Uri(
                        path: '/log-payment',
                        queryParameters: {'student': student.id},
                      ).toString(),
                    );
                  },
                  icon: const Icon(Icons.payment),
                  label: const Text('Process Payment'),
                ),
              )
            else
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: () => Navigator.pop(context),
                  icon: Icon(
                    student.balance > 0 ? Icons.savings : Icons.check_circle,
                  ),
                  label: Text(
                    student.balance > 0 ? 'In credit' : 'All clear',
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildDetailRow(String label, String value) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label,
            style: const TextStyle(
                color: AppColors.textSecondary,
                fontWeight: FontWeight.w500)),
        Text(value,
            style:
                const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
      ],
    );
  }
}
