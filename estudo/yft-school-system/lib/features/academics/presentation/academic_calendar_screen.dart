import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/auth/auth_state.dart';
import 'package:yft_school_system/core/models/school_academic_calendar.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';
import 'package:yft_school_system/core/settings/academic_year_state.dart';
import 'package:yft_school_system/core/utils/date_utils.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';

class AcademicCalendarScreen extends ConsumerStatefulWidget {
  const AcademicCalendarScreen({super.key});

  @override
  ConsumerState<AcademicCalendarScreen> createState() =>
      _AcademicCalendarScreenState();
}

class _AcademicCalendarScreenState
    extends ConsumerState<AcademicCalendarScreen> {
  bool _isTriTerm = true;
  bool _isLoading = true;
  String? _loadError;

  // Date state for each term
  DateTime? _term1Start;
  DateTime? _term1End;
  DateTime? _term2Start;
  DateTime? _term2End;
  DateTime? _term3Start;
  DateTime? _term3End;

  @override
  void initState() {
    super.initState();
    _loadAcademicCalendar();
  }

  Future<void> _loadAcademicCalendar() async {
    try {
      final calendar = await ref
          .read(userRepositoryProvider)
          .getAcademicCalendar();
      if (!mounted) return;

      if (calendar != null) {
        ref
            .read(academicYearProvider.notifier)
            .setAcademicYear(calendar.academicYear);
        ref
            .read(academicYearProvider.notifier)
            .setActiveTerm(calendar.activeTerm);
        ref.read(academicYearProvider.notifier).setCurrency(calendar.currency);

        setState(() {
          _isTriTerm = calendar.termSystem == 3;
          _term1Start = calendar.terms.isNotEmpty
              ? calendar.terms[0].startDate
              : null;
          _term1End = calendar.terms.isNotEmpty
              ? calendar.terms[0].endDate
              : null;
          _term2Start = calendar.terms.length > 1
              ? calendar.terms[1].startDate
              : null;
          _term2End = calendar.terms.length > 1
              ? calendar.terms[1].endDate
              : null;
          _term3Start = calendar.terms.length > 2
              ? calendar.terms[2].startDate
              : null;
          _term3End = calendar.terms.length > 2
              ? calendar.terms[2].endDate
              : null;
          _isLoading = false;
          _loadError = null;
        });
        return;
      }

      setState(() {
        _isLoading = false;
        _loadError = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _loadError = '$e';
      });
    }
  }

  Future<void> _selectDate(
    BuildContext context,
    DateTime? current,
    ValueChanged<DateTime> onPicked,
  ) async {
    final DateTime? picked = await showDatePicker(
      context: context,
      initialDate: current ?? DateTime.now(),
      firstDate: DateTime(2020),
      lastDate: getMaxDatePickerDate(),
    );
    if (picked != null) {
      onPicked(picked);
    }
  }

  String _formatDate(DateTime? date) {
    if (date == null) return 'Select...';
    return '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year}';
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(authProvider);
    final isReadOnly = session?.role != UserRole.admin;
    final academicYear = ref.watch(academicYearProvider);

    if (_isLoading) {
      return Scaffold(
        backgroundColor: AppColors.background,
        appBar: AppBar(
          title: const Text(
            'Academic Calendar',
            style: TextStyle(fontWeight: FontWeight.bold),
          ),
          backgroundColor: Colors.transparent,
          elevation: 0,
          foregroundColor: AppColors.secondary,
        ),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    if (_loadError != null) {
      return Scaffold(
        backgroundColor: AppColors.background,
        appBar: AppBar(
          title: const Text(
            'Academic Calendar',
            style: TextStyle(fontWeight: FontWeight.bold),
          ),
          backgroundColor: Colors.transparent,
          elevation: 0,
          foregroundColor: AppColors.secondary,
        ),
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                LucideIcons.alertTriangle,
                size: 48,
                color: AppColors.error,
              ),
              const SizedBox(height: 16),
              Text(
                _loadError!,
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.textSecondary),
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: _loadAcademicCalendar,
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text(
          'Academic Calendar',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: AppColors.secondary,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Academic Year Section
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: AppColors.secondary,
                borderRadius: BorderRadius.circular(24),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Academic Year',
                    style: TextStyle(color: Colors.white70, fontSize: 13),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    academicYear.academicYear,
                    style: const TextStyle(
                      color: AppColors.primary,
                      fontSize: 28,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Active Term: ${academicYear.activeTerm}',
                    style: const TextStyle(color: Colors.white54, fontSize: 13),
                  ),
                  if (!isReadOnly) ...[
                    const SizedBox(height: 20),
                    const Divider(color: Colors.white12),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Expanded(
                          child: _buildAcademicYearDropdown(
                            academicYear.academicYear,
                          ),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: _buildActiveTermDropdown(
                            academicYear.activeTerm,
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),

            const SizedBox(height: 32),

            // Term Structure Selector
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(24),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.02),
                    blurRadius: 10,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'System Currency & Settings',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Select the default currency symbol across the platform.',
                    style: TextStyle(
                      color: AppColors.textSecondary,
                      fontSize: 13,
                    ),
                  ),
                  const SizedBox(height: 16),
                  if (!isReadOnly)
                    DropdownButtonFormField<String>(
                      initialValue: academicYear.currency,
                      decoration: InputDecoration(
                        filled: true,
                        fillColor: AppColors.background,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: BorderSide.none,
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 16,
                        ),
                      ),
                      items: const [
                        DropdownMenuItem(
                          value: 'GH₵',
                          child: Text('Ghana Cedis (GH₵)'),
                        ),
                        DropdownMenuItem(
                          value: '\$',
                          child: Text('US Dollars (\$)'),
                        ),
                      ],
                      onChanged: (val) {
                        if (val != null) {
                          ref
                              .read(academicYearProvider.notifier)
                              .setCurrency(val);
                        }
                      },
                    ),

                  const SizedBox(height: 32),

                  const Text(
                    'Term Structure',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Select whether the academic year is divided into two or three terms.',
                    style: TextStyle(
                      color: AppColors.textSecondary,
                      fontSize: 13,
                    ),
                  ),
                  const SizedBox(height: 24),
                  Row(
                    children: [
                      Expanded(
                        child: _buildTermToggle(
                          title: 'Bi Terms (2)',
                          isSelected: !_isTriTerm,
                          onTap: isReadOnly
                              ? null
                              : () => setState(() => _isTriTerm = false),
                        ),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: _buildTermToggle(
                          title: 'Tri Terms (3)',
                          isSelected: _isTriTerm,
                          onTap: isReadOnly
                              ? null
                              : () => setState(() => _isTriTerm = true),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),

            const SizedBox(height: 32),

            // Term Date Configs
            const Text(
              'Term Dates & Durations',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 20),
            ),
            const SizedBox(height: 16),

            _buildTermConfigCard(
              'First Term',
              'Select dates for the first academic term.',
              _term1Start,
              _term1End,
              isReadOnly,
              (d) => setState(() => _term1Start = d),
              (d) => setState(() => _term1End = d),
            ),
            _buildTermConfigCard(
              'Second Term',
              'Select dates for the second academic term.',
              _term2Start,
              _term2End,
              isReadOnly,
              (d) => setState(() => _term2Start = d),
              (d) => setState(() => _term2End = d),
            ),
            if (_isTriTerm)
              _buildTermConfigCard(
                'Third Term',
                'Select dates for the third academic term.',
                _term3Start,
                _term3End,
                isReadOnly,
                (d) => setState(() => _term3Start = d),
                (d) => setState(() => _term3End = d),
              ),

            if (!isReadOnly) ...[
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                height: 56,
                child: ElevatedButton(
                  onPressed: isReadOnly
                      ? null
                      : () async {
                          final requiredTermCount = _isTriTerm ? 3 : 2;
                          final termDates = [
                            (_term1Start, _term1End, 'Term 1'),
                            (_term2Start, _term2End, 'Term 2'),
                            if (_isTriTerm) (_term3Start, _term3End, 'Term 3'),
                          ];

                          if (termDates.length != requiredTermCount ||
                              termDates.any(
                                (entry) => entry.$1 == null || entry.$2 == null,
                              )) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text(
                                  'Please select valid start and end dates for every active term.',
                                ),
                              ),
                            );
                            return;
                          }

                          for (final entry in termDates) {
                            if (entry.$1!.isAfter(entry.$2!)) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content: Text(
                                    '${entry.$3} start date must be before its end date.',
                                  ),
                                ),
                              );
                              return;
                            }
                          }

                          final terms = <AcademicCalendarTerm>[
                            AcademicCalendarTerm(
                              name: 'Term 1',
                              startDate: _term1Start!,
                              endDate: _term1End!,
                            ),
                            AcademicCalendarTerm(
                              name: 'Term 2',
                              startDate: _term2Start!,
                              endDate: _term2End!,
                            ),
                            if (_isTriTerm)
                              AcademicCalendarTerm(
                                name: 'Term 3',
                                startDate: _term3Start!,
                                endDate: _term3End!,
                              ),
                          ];

                          try {
                            await ref
                                .read(userRepositoryProvider)
                                .saveAcademicCalendar(
                                  calendar: SchoolAcademicCalendar(
                                    academicYear: academicYear.academicYear,
                                    activeTerm: academicYear.activeTerm,
                                    currency: academicYear.currency,
                                    termSystem: _isTriTerm ? 3 : 2,
                                    terms: terms,
                                  ),
                                );
                            if (!context.mounted) return;
                            if (context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                  content: Text(
                                    'Academic Calendar saved successfully!',
                                    style: TextStyle(
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ),
                              );
                            }
                          } catch (e) {
                            if (!context.mounted) return;
                            if (context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content: Text(
                                    'Failed to save academic calendar: $e',
                                  ),
                                  backgroundColor: AppColors.error,
                                ),
                              );
                            }
                          }
                        },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: AppColors.secondary,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                  child: const Text(
                    'Save Configuration',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                  ),
                ),
              ),
            ],
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _buildAcademicYearDropdown(String current) {
    final years = getAcademicYears();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: current,
          dropdownColor: AppColors.secondary,
          isExpanded: true,
          icon: const Icon(
            LucideIcons.chevronDown,
            color: Colors.white54,
            size: 18,
          ),
          items: years
              .map(
                (y) => DropdownMenuItem(
                  value: y,
                  child: Text(
                    y,
                    style: const TextStyle(color: Colors.white, fontSize: 14),
                  ),
                ),
              )
              .toList(),
          onChanged: (val) {
            if (val != null) {
              ref.read(academicYearProvider.notifier).setAcademicYear(val);
            }
          },
        ),
      ),
    );
  }

  Widget _buildActiveTermDropdown(String current) {
    final terms = _isTriTerm
        ? ['Term 1', 'Term 2', 'Term 3']
        : ['Term 1', 'Term 2'];
    final safeValue = terms.contains(current) ? current : terms.first;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: safeValue,
          dropdownColor: AppColors.secondary,
          isExpanded: true,
          icon: const Icon(
            LucideIcons.chevronDown,
            color: Colors.white54,
            size: 18,
          ),
          items: terms
              .map(
                (t) => DropdownMenuItem(
                  value: t,
                  child: Text(
                    t,
                    style: const TextStyle(color: Colors.white, fontSize: 14),
                  ),
                ),
              )
              .toList(),
          onChanged: (val) {
            if (val != null) {
              ref.read(academicYearProvider.notifier).setActiveTerm(val);
            }
          },
        ),
      ),
    );
  }

  Widget _buildTermToggle({
    required String title,
    required bool isSelected,
    VoidCallback? onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 16),
        decoration: BoxDecoration(
          color: isSelected
              ? AppColors.primary.withValues(alpha: 0.1)
              : AppColors.background,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isSelected ? AppColors.primary : Colors.transparent,
            width: 2,
          ),
        ),
        alignment: Alignment.center,
        child: Text(
          title,
          style: TextStyle(
            fontWeight: FontWeight.bold,
            color: isSelected ? AppColors.primary : AppColors.textSecondary,
          ),
        ),
      ),
    );
  }

  Widget _buildTermConfigCard(
    String termName,
    String description,
    DateTime? startDate,
    DateTime? endDate,
    bool isReadOnly,
    ValueChanged<DateTime> onStartPicked,
    ValueChanged<DateTime> onEndPicked,
  ) {
    return Container(
      margin: const EdgeInsets.only(bottom: 20),
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.02),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppColors.secondary.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(
                  LucideIcons.calendarDays,
                  color: AppColors.secondary,
                  size: 20,
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      termName,
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 18,
                      ),
                    ),
                    Text(
                      description,
                      style: const TextStyle(
                        color: AppColors.textSecondary,
                        fontSize: 11,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),
          Row(
            children: [
              Expanded(
                child: _buildDatePickerField(
                  'Start Date',
                  startDate,
                  isReadOnly
                      ? null
                      : () => _selectDate(context, startDate, onStartPicked),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: _buildDatePickerField(
                  'End Date',
                  endDate,
                  isReadOnly
                      ? null
                      : () => _selectDate(context, endDate, onEndPicked),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildDatePickerField(
    String label,
    DateTime? date,
    VoidCallback? onTap,
  ) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            fontWeight: FontWeight.w600,
            fontSize: 12,
            color: AppColors.textSecondary,
          ),
        ),
        const SizedBox(height: 8),
        InkWell(
          onTap: onTap,
          child: InputDecorator(
            decoration: InputDecoration(
              hintText: label,
              prefixIcon: const Icon(LucideIcons.calendar, size: 20),
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 16,
                vertical: 12,
              ),
            ),
            child: Text(
              _formatDate(date),
              style: TextStyle(
                color: date == null
                    ? AppColors.textSecondary.withValues(alpha: 0.5)
                    : AppColors.textPrimary,
              ),
            ),
          ),
        ),
      ],
    );
  }
}
