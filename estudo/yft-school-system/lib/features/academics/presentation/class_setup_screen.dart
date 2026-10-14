import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/models/school_class.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';
import 'package:yft_school_system/core/settings/academic_year_state.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/utils/responsive_utils.dart';
import 'package:go_router/go_router.dart';

class ClassSetupScreen extends ConsumerStatefulWidget {
  final SchoolClass? schoolClass;

  const ClassSetupScreen({super.key, this.schoolClass});

  @override
  ConsumerState<ClassSetupScreen> createState() => _ClassSetupScreenState();
}

class _ClassSetupScreenState extends ConsumerState<ClassSetupScreen> {
  late final TextEditingController _nameController;
  late final TextEditingController _levelController;
  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(
      text: widget.schoolClass?.className ?? '',
    );
    _levelController = TextEditingController(
      text: widget.schoolClass?.level != null
          ? '${widget.schoolClass!.level}'
          : '',
    );
  }

  @override
  void dispose() {
    _nameController.dispose();
    _levelController.dispose();
    super.dispose();
  }

  Future<void> _saveClass() async {
    if (_nameController.text.trim().isEmpty) return;

    setState(() => _isSaving = true);
    try {
      final repo = ref.read(classRepositoryProvider);
      if (widget.schoolClass != null) {
        await repo.updateClass(
          classId: widget.schoolClass!.id,
          className: _nameController.text.trim(),
          level: int.tryParse(_levelController.text.trim()),
        );
      } else {
        await repo.createClass(
          className: _nameController.text.trim(),
          level: int.tryParse(_levelController.text.trim()),
        );
      }
      ref.invalidate(classesProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Class saved successfully'),
            backgroundColor: Colors.green,
          ),
        );
        if (widget.schoolClass == null) {
          // If it was a new class, pop back or let user stay to add fees
          context.pop();
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('$e'), backgroundColor: AppColors.error),
        );
      }
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isEditing = widget.schoolClass != null;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: Text(
          isEditing
              ? 'Class Setup: ${widget.schoolClass!.className}'
              : 'New Class Setup',
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: AppColors.secondary,
      ),
      body: SingleChildScrollView(
        padding: getResponsiveHorizontalPadding(
          context,
        ).copyWith(top: 24, bottom: 100),
        child: ResponsiveConstrainedContent(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildSectionTitle('Class Information'),
              const SizedBox(height: 16),
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
                  children: [
                    TextField(
                      controller: _nameController,
                      decoration: const InputDecoration(
                        hintText: 'Class Name (e.g. Basic 7)',
                        prefixIcon: Icon(LucideIcons.graduationCap, size: 20),
                        labelText: 'Class Name',
                      ),
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: _levelController,
                      decoration: const InputDecoration(
                        hintText: 'Level (used for sorting)',
                        prefixIcon: Icon(LucideIcons.barChart2, size: 20),
                        labelText: 'Level',
                      ),
                      keyboardType: TextInputType.number,
                    ),
                    const SizedBox(height: 24),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: _isSaving ? null : _saveClass,
                        child: _isSaving
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : Text(
                                isEditing
                                    ? 'Update Class Details'
                                    : 'Create Class',
                              ),
                      ),
                    ),
                  ],
                ),
              ),

              if (isEditing) ...[
                const SizedBox(height: 40),
                _buildSectionTitle('Academic Fees & Finances'),
                const SizedBox(height: 16),
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
                    children: [
                      const Icon(
                        LucideIcons.banknote,
                        size: 48,
                        color: AppColors.primary,
                      ),
                      const SizedBox(height: 16),
                      const Text(
                        'Fee structures for this class are configured here. Choose whether the class is billed per term or once per academic year, then apply the fee to current students.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: AppColors.textSecondary),
                      ),
                      if (widget.schoolClass?.hasFeeStructure == true) ...[
                        const SizedBox(height: 12),
                        Text(
                          'Current structure: GH₵ ${widget.schoolClass!.feeAmount.toStringAsFixed(2)} / ${widget.schoolClass!.feeCollectionCycle == 'year' ? 'year' : 'term'}',
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontWeight: FontWeight.w600,
                            color: AppColors.secondary,
                          ),
                        ),
                      ],
                      const SizedBox(height: 24),
                      SizedBox(
                        width: double.infinity,
                        child: OutlinedButton.icon(
                          onPressed: () => _showChargeClassSheet(context),
                          icon: const Icon(LucideIcons.settings),
                          label: const Text('Configure Fee Structure'),
                        ),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 40),
                _buildSectionTitle('Subjects & Curriculum'),
                const SizedBox(height: 16),
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
                    children: [
                      const Icon(
                        LucideIcons.bookOpen,
                        size: 48,
                        color: AppColors.primary,
                      ),
                      const SizedBox(height: 16),
                      const Text(
                        'Assign specific subjects to this class for the term.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: AppColors.textSecondary),
                      ),
                      const SizedBox(height: 24),
                      SizedBox(
                        width: double.infinity,
                        child: OutlinedButton.icon(
                          onPressed: () {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text('Subjects module coming soon'),
                              ),
                            );
                          },
                          icon: const Icon(LucideIcons.book),
                          label: const Text('Manage Assigned Subjects'),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSectionTitle(String title) {
    return Text(
      title,
      style: const TextStyle(
        fontSize: 18,
        fontWeight: FontWeight.bold,
        color: AppColors.secondary,
      ),
    );
  }

  void _showChargeClassSheet(BuildContext context) {
    if (widget.schoolClass == null) return;

    final titleController = TextEditingController(
      text: widget.schoolClass?.className ?? '',
    );
    final amountController = TextEditingController(
      text: ((widget.schoolClass?.feeAmount ?? 0) > 0)
          ? widget.schoolClass!.feeAmount.toStringAsFixed(2)
          : '',
    );
    var selectedCycle = widget.schoolClass?.feeCollectionCycle ?? 'term';
    var applyToCurrentStudents = true;
    bool isSaving = false;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) {
        return StatefulBuilder(
          builder: (sheetContext, setSheetState) {
            return Padding(
              padding: EdgeInsets.only(
                bottom: MediaQuery.of(sheetContext).viewInsets.bottom,
              ),
              child: Container(
                decoration: const BoxDecoration(
                  color: AppColors.background,
                  borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
                ),
                padding: EdgeInsets.fromLTRB(
                  32,
                  32,
                  32,
                  MediaQuery.of(sheetContext).padding.bottom + 32,
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Configure Class Fee Structure',
                      style: TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Store the fee structure on the class, then decide whether it collects per term or by academic year.',
                      style: TextStyle(
                        color: AppColors.textSecondary,
                        fontSize: 14,
                      ),
                    ),
                    const SizedBox(height: 24),
                    TextField(
                      controller: titleController,
                      decoration: const InputDecoration(
                        hintText: 'Fee label (e.g. Term 1 Tuition)',
                        prefixIcon: Icon(LucideIcons.tag, size: 20),
                      ),
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: amountController,
                      decoration: const InputDecoration(
                        hintText: 'Amount (GH₵)',
                        prefixIcon: Icon(LucideIcons.coins, size: 20),
                      ),
                      keyboardType: TextInputType.number,
                    ),
                    const SizedBox(height: 16),
                    DropdownButtonFormField<String>(
                      initialValue: selectedCycle,
                      decoration: const InputDecoration(
                        labelText: 'Collection cycle',
                        prefixIcon: Icon(LucideIcons.calendarRange, size: 20),
                      ),
                      items: const [
                        DropdownMenuItem(
                          value: 'term',
                          child: Text('Per term'),
                        ),
                        DropdownMenuItem(
                          value: 'year',
                          child: Text('Per academic year'),
                        ),
                      ],
                      onChanged: (value) {
                        if (value != null) {
                          setSheetState(() => selectedCycle = value);
                        }
                      },
                    ),
                    const SizedBox(height: 8),
                    CheckboxListTile(
                      value: applyToCurrentStudents,
                      onChanged: (value) {
                        setSheetState(() {
                          applyToCurrentStudents = value ?? true;
                        });
                      },
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Apply to current students now'),
                      subtitle: Text(
                        selectedCycle == 'year'
                            ? 'The fee will be tracked against the current academic year.'
                            : 'The fee will be tracked against the current term.',
                      ),
                      controlAffinity: ListTileControlAffinity.leading,
                    ),
                    const SizedBox(height: 32),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: isSaving
                            ? null
                            : () async {
                                final amount =
                                    double.tryParse(
                                      amountController.text.trim(),
                                    ) ??
                                    0;
                                if (amount <= 0) return;

                                List<SchoolClass> freshClasses = const [];
                                try {
                                  freshClasses =
                                      await ref.read(classesProvider.future);
                                } catch (_) {
                                  freshClasses = const [];
                                }
                                SchoolClass? liveClass;
                                for (final c in freshClasses) {
                                  if (c.id == widget.schoolClass!.id) {
                                    liveClass = c;
                                    break;
                                  }
                                }
                                final baselineFee =
                                    liveClass?.feeAmount ??
                                    widget.schoolClass!.feeAmount;
                                final feeDelta = amount - baselineFee;

                                setSheetState(() => isSaving = true);
                                try {
                                  await ref
                                      .read(classRepositoryProvider)
                                      .updateClass(
                                        classId: widget.schoolClass!.id,
                                        className:
                                            widget.schoolClass!.className,
                                        level: widget.schoolClass!.level,
                                        feeAmount: amount,
                                        feeCollectionCycle: selectedCycle,
                                      );

                                  if (applyToCurrentStudents && feeDelta != 0) {
                                    final settings = ref.read(
                                      academicYearProvider,
                                    );
                                    final adjustmentDescription =
                                        titleController.text.trim().isEmpty
                                        ? 'Class fee structure adjustment (${settings.academicYear})'
                                        : titleController.text.trim();

                                    await ref
                                        .read(financeRepositoryProvider)
                                        .adjustClassFee(
                                          classId: widget.schoolClass!.id,
                                          amountDelta: feeDelta,
                                          description: adjustmentDescription,
                                        );
                                  }

                                  ref.invalidate(classesProvider);
                                  if (sheetContext.mounted) {
                                    Navigator.pop(sheetContext);
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      SnackBar(
                                        content: Text(
                                          applyToCurrentStudents
                                              ? 'Fee structure saved and applied.'
                                              : 'Fee structure saved.',
                                        ),
                                        backgroundColor: Colors.green,
                                      ),
                                    );
                                  }
                                } catch (e) {
                                  setSheetState(() => isSaving = false);
                                  if (sheetContext.mounted) {
                                    ScaffoldMessenger.of(
                                      sheetContext,
                                    ).showSnackBar(
                                      SnackBar(
                                        content: Text('$e'),
                                        backgroundColor: AppColors.error,
                                      ),
                                    );
                                  }
                                }
                              },
                        child: isSaving
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Text('Save Fee Structure'),
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }
}
