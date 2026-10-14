import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/models/student.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';
import 'package:yft_school_system/core/settings/academic_year_state.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/utils/responsive_utils.dart';

/// Full-screen flow to record a fee payment: pick a student from the roster
/// (name, **ID**, class, balance) so payments are not mis-attributed, then confirm.
class LogPaymentScreen extends ConsumerStatefulWidget {
  const LogPaymentScreen({super.key, this.initialStudentId});

  final String? initialStudentId;

  @override
  ConsumerState<LogPaymentScreen> createState() => _LogPaymentScreenState();
}

class _LogPaymentScreenState extends ConsumerState<LogPaymentScreen> {
  final _searchController = TextEditingController();
  final _amountController = TextEditingController();
  final _descriptionController = TextEditingController();

  String _searchQuery = '';
  String _classFilter = 'All Classes';
  Student? _selected;
  bool _confirmChecked = false;
  bool _submitting = false;
  bool _appliedInitial = false;

  static const _studentsKey = (classId: null, page: 1);

  @override
  void dispose() {
    _searchController.dispose();
    _amountController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  void _applyInitialSelection(List<Student> students) {
    if (_appliedInitial || widget.initialStudentId == null) return;
    final id = widget.initialStudentId!;
    for (final s in students) {
      if (s.id == id) {
        _appliedInitial = true;
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (!mounted) return;
          setState(() {
            _selected = s;
            _confirmChecked = false;
            if (s.balance < 0) {
              _amountController.text = s.balance.abs().toStringAsFixed(2);
            } else {
              _amountController.clear();
            }
          });
        });
        break;
      }
    }
  }

  String _displayClass(Student s, Map<String, String> classNames) {
    return s.className ?? classNames[s.classId] ?? s.classId;
  }

  bool _matchesSearch(Student s) {
    if (_searchQuery.isEmpty) return true;
    final q = _searchQuery.toLowerCase();
    return s.name.toLowerCase().contains(q) || s.id.toLowerCase().contains(q);
  }

  Future<void> _submit(String currency) async {
    final s = _selected;
    if (s == null) return;
    final amount = double.tryParse(_amountController.text.trim());
    if (amount == null || amount <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter a valid amount greater than zero.')),
      );
      return;
    }
    if (!_confirmChecked) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Confirm that this payment is for the selected student.'),
        ),
      );
      return;
    }

    setState(() => _submitting = true);
    try {
      final result = await ref.read(financeRepositoryProvider).logPayment(
            studentId: s.id,
            amount: amount,
            description: _descriptionController.text.trim().isEmpty
                ? null
                : _descriptionController.text.trim(),
            verifyStudentName: s.name,
            verifyClassId: s.classId,
          );
      ref.invalidate(arrearsProvider);
      ref.invalidate(studentsProvider(_studentsKey));
      if (!mounted) return;
      final payCur = result.currency ?? currency;
      final credit = result.creditAddedOrZero;
      final msg = StringBuffer('Payment recorded.');
      if (credit > 0) {
        msg.write(' Credit added: $payCur ${credit.toStringAsFixed(2)}.');
      }
      msg.write(' New balance: $payCur ${result.balance.toStringAsFixed(2)}.');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(msg.toString())),
      );
      context.pop();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Payment failed: $e'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final studentsAsync = ref.watch(studentsProvider(_studentsKey));
    final classesAsync = ref.watch(classesProvider);
    final currency = ref.watch(academicYearProvider).currency;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text(
          'Record fee payment',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: AppColors.secondary,
      ),
      body: studentsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('Could not load students', style: TextStyle(color: AppColors.error)),
                const SizedBox(height: 12),
                TextButton(
                  onPressed: () => ref.invalidate(studentsProvider(_studentsKey)),
                  child: const Text('Retry'),
                ),
              ],
            ),
          ),
        ),
        data: (paginated) {
          final allStudents = paginated.data;
          final classNames = classesAsync.whenOrNull(
                data: (classes) => Map.fromEntries(
                  classes.map((c) => MapEntry(c.id, c.className)),
                ),
              ) ??
              {};

          _applyInitialSelection(allStudents);

          final classSet = <String>{'All Classes'};
          for (final s in allStudents) {
            final cn = _displayClass(s, classNames);
            if (cn.isNotEmpty) classSet.add(cn);
          }
          final classes = classSet.toList()..sort();

          final filtered = allStudents.where((s) {
            final displayClass = _displayClass(s, classNames);
            final matchesClass =
                _classFilter == 'All Classes' || displayClass == _classFilter;
            return matchesClass && _matchesSearch(s);
          }).toList()
            ..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));

          return ResponsiveConstrainedContent(
            child: Column(
              children: [
                Padding(
                  padding: getResponsiveHorizontalPadding(context).copyWith(
                    top: 8,
                    bottom: 8,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      TextField(
                        controller: _searchController,
                        decoration: InputDecoration(
                          hintText: 'Search by name or student ID…',
                          prefixIcon: const Icon(LucideIcons.search, size: 20),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                          isDense: true,
                        ),
                        onChanged: (v) => setState(() => _searchQuery = v),
                      ),
                      const SizedBox(height: 10),
                      InputDecorator(
                        decoration: const InputDecoration(
                          labelText: 'Class',
                          border: OutlineInputBorder(),
                          isDense: true,
                          contentPadding: EdgeInsets.symmetric(horizontal: 12),
                        ),
                        child: DropdownButtonHideUnderline(
                          child: DropdownButton<String>(
                            isExpanded: true,
                            value: classes.contains(_classFilter)
                                ? _classFilter
                                : 'All Classes',
                            items: classes
                                .map(
                                  (c) => DropdownMenuItem(value: c, child: Text(c)),
                                )
                                .toList(),
                            onChanged: (v) {
                              if (v != null) setState(() => _classFilter = v);
                            },
                          ),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Select the exact student. IDs are unique even when names match.',
                        style: TextStyle(
                          fontSize: 12,
                          color: AppColors.textSecondary.withValues(alpha: 0.95),
                        ),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  flex: _selected == null ? 1 : 5,
                  child: filtered.isEmpty
                      ? Center(
                          child: Text(
                            'No students match your filters.',
                            style: TextStyle(color: AppColors.textSecondary),
                          ),
                        )
                      : ListView.separated(
                          padding: getResponsiveHorizontalPadding(context).copyWith(
                            bottom: 12,
                          ),
                          itemCount: filtered.length,
                          separatorBuilder: (_, _) => const SizedBox(height: 8),
                          itemBuilder: (context, i) {
                            final s = filtered[i];
                            final dc = _displayClass(s, classNames);
                            final selected = _selected?.id == s.id;
                            return Material(
                              color: AppColors.surface,
                              borderRadius: BorderRadius.circular(16),
                              clipBehavior: Clip.antiAlias,
                              child: InkWell(
                                onTap: () {
                                  setState(() {
                                    _selected = s;
                                    _confirmChecked = false;
                                    if (s.balance < 0) {
                                      _amountController.text =
                                          s.balance.abs().toStringAsFixed(2);
                                    } else {
                                      _amountController.clear();
                                    }
                                  });
                                },
                                child: Container(
                                  decoration: BoxDecoration(
                                    border: Border.all(
                                      color: selected
                                          ? AppColors.primaryOnLight
                                          : Colors.grey.shade200,
                                      width: selected ? 2 : 1,
                                    ),
                                    borderRadius: BorderRadius.circular(16),
                                  ),
                                  padding: const EdgeInsets.all(14),
                                  child: Row(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Icon(
                                        selected
                                            ? LucideIcons.checkCircle2
                                            : LucideIcons.circle,
                                        color: selected
                                            ? AppColors.primaryOnLight
                                            : AppColors.textSecondary,
                                        size: 22,
                                      ),
                                      const SizedBox(width: 12),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              s.name,
                                              style: const TextStyle(
                                                fontWeight: FontWeight.bold,
                                                fontSize: 16,
                                              ),
                                            ),
                                            const SizedBox(height: 4),
                                            SelectableText(
                                              'Student ID: ${s.id}',
                                              style: TextStyle(
                                                fontSize: 12,
                                                fontFamily: 'monospace',
                                                color: AppColors.secondary
                                                    .withValues(alpha: 0.85),
                                              ),
                                            ),
                                            const SizedBox(height: 2),
                                            Text(
                                              'Class: $dc',
                                              style: const TextStyle(
                                                fontSize: 12,
                                                color: AppColors.textSecondary,
                                              ),
                                            ),
                                            if (s.parentName != null &&
                                                s.parentName!.trim().isNotEmpty)
                                              Text(
                                                'Parent: ${s.parentName!.trim()}',
                                                style: const TextStyle(
                                                  fontSize: 11,
                                                  color: AppColors.textSecondary,
                                                ),
                                              ),
                                          ],
                                        ),
                                      ),
                                      Column(
                                        crossAxisAlignment: CrossAxisAlignment.end,
                                        children: [
                                          Text(
                                            'Balance',
                                            style: TextStyle(
                                              fontSize: 10,
                                              color: AppColors.textSecondary,
                                            ),
                                          ),
                                          Text(
                                            '$currency ${s.balance.toStringAsFixed(2)}',
                                            style: TextStyle(
                                              fontWeight: FontWeight.bold,
                                              fontSize: 14,
                                              color: s.balance < 0
                                                  ? AppColors.error
                                                  : (s.balance > 0
                                                      ? Colors.blue.shade800
                                                      : AppColors.textSecondary),
                                            ),
                                          ),
                                        ],
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            );
                          },
                        ),
                ),
                if (_selected != null)
                  Expanded(
                    flex: 4,
                    child: Material(
                      elevation: 6,
                      color: AppColors.surface,
                      child: SingleChildScrollView(
                        padding: EdgeInsets.fromLTRB(
                          20,
                          16,
                          20,
                          16 + MediaQuery.paddingOf(context).bottom,
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Text(
                              'Payment details',
                              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                    fontWeight: FontWeight.bold,
                                  ),
                            ),
                            const SizedBox(height: 12),
                            Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: AppColors.background,
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(color: Colors.grey.shade300),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  _summaryRow('Student', _selected!.name),
                                  _summaryRow(
                                    'Student ID',
                                    _selected!.id,
                                    mono: true,
                                  ),
                                  _summaryRow(
                                    'Class',
                                    _displayClass(_selected!, classNames),
                                  ),
                                  _summaryRow(
                                    'Balance before',
                                    '$currency ${_selected!.balance.toStringAsFixed(2)}',
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 16),
                            TextField(
                              controller: _amountController,
                              decoration: InputDecoration(
                                labelText: 'Amount ($currency)',
                                border: const OutlineInputBorder(),
                              ),
                              keyboardType:
                                  const TextInputType.numberWithOptions(decimal: true),
                            ),
                            const SizedBox(height: 12),
                            TextField(
                              controller: _descriptionController,
                              decoration: const InputDecoration(
                                labelText: 'Description (optional)',
                                border: OutlineInputBorder(),
                              ),
                              maxLines: 2,
                            ),
                            const SizedBox(height: 12),
                            CheckboxListTile(
                              value: _confirmChecked,
                              onChanged: (v) =>
                                  setState(() => _confirmChecked = v ?? false),
                              controlAffinity: ListTileControlAffinity.leading,
                              contentPadding: EdgeInsets.zero,
                              title: Text(
                                'I confirm this payment is for ${_selected!.name} '
                                '(ID: ${_selected!.id}).',
                                style: const TextStyle(fontSize: 13, height: 1.35),
                              ),
                            ),
                            const SizedBox(height: 8),
                            SizedBox(
                              height: 48,
                              child: ElevatedButton(
                                onPressed: _submitting
                                    ? null
                                    : () => _submit(currency),
                                child: _submitting
                                    ? const SizedBox(
                                        width: 22,
                                        height: 22,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                          color: Colors.white,
                                        ),
                                      )
                                    : const Text(
                                        'Record payment',
                                        style: TextStyle(
                                          fontWeight: FontWeight.w600,
                                          fontSize: 16,
                                        ),
                                      ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _summaryRow(String label, String value, {bool mono = false}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 110,
            child: Text(
              label,
              style: const TextStyle(
                fontSize: 12,
                color: AppColors.textSecondary,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                fontFamily: mono ? 'monospace' : null,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
