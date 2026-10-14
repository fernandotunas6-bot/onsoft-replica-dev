import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/auth/auth_state.dart';
import 'package:yft_school_system/core/models/subject.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';
import 'package:yft_school_system/core/repositories/grades_repository.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';

class ResultsInputScreen extends ConsumerStatefulWidget {
  final Map<String, dynamic>? extraArgs;

  const ResultsInputScreen({super.key, this.extraArgs});

  @override
  ConsumerState<ResultsInputScreen> createState() => _ResultsInputScreenState();
}

class _ResultsInputScreenState extends ConsumerState<ResultsInputScreen> {
  late final String studentId;
  late final String classId;
  late final String term;

  bool _loading = true;
  String? _loadError;
  List<Subject> _subjects = [];

  final Map<String, TextEditingController> _classControllers = {};
  final Map<String, TextEditingController> _examControllers = {};

  bool _saveBusy = false;
  bool _didBootstrap = false;

  @override
  void initState() {
    super.initState();
    studentId = widget.extraArgs?['studentId'] as String? ?? '';
    classId = widget.extraArgs?['className'] as String? ?? '';
    term = widget.extraArgs?['term'] as String? ?? '';
    WidgetsBinding.instance.addPostFrameCallback((_) => _bootstrap());
  }

  @override
  void dispose() {
    for (final c in _classControllers.values) {
      c.dispose();
    }
    for (final c in _examControllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _bootstrap() async {
    if (_didBootstrap) return;
    if (studentId.isEmpty || classId.isEmpty || term.isEmpty) {
      setState(() {
        _loading = false;
        _loadError = 'Missing student, class, or term.';
      });
      return;
    }
    _didBootstrap = true;

    setState(() {
      _loading = true;
      _loadError = null;
    });

    try {
      final subjects = await ref.read(subjectRepositoryProvider).getSubjects(
            classId: classId,
          );
      final gradeMap = await ref.read(gradesRepositoryProvider).getGradesForStudent(
            studentId: studentId,
            term: term,
          );

      if (!mounted) return;

      for (final c in _classControllers.values) {
        c.dispose();
      }
      for (final c in _examControllers.values) {
        c.dispose();
      }
      _classControllers.clear();
      _examControllers.clear();

      for (final s in subjects) {
        final g = gradeMap[s.id];
        final cs = g == null || g.classScore <= 0
            ? ''
            : g.classScore.round().toString();
        final es = g == null || g.examScore <= 0
            ? ''
            : g.examScore.round().toString();
        _classControllers[s.id] = TextEditingController(text: cs);
        _examControllers[s.id] = TextEditingController(text: es);
      }

      setState(() {
        _subjects = subjects;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _loadError = '$e';
      });
    }
  }

  bool _computeReadOnly(AppSession? session) {
    if (session == null) return true;
    if (session.role == UserRole.admin) return false;
    if (session.role == UserRole.teacher) {
      return !session.teacherCanEditResults;
    }
    return true;
  }

  Future<void> _save() async {
    if (_computeReadOnly(ref.read(authProvider)) || _saveBusy) return;

    final rows = <GradeUpsertRow>[];
    for (final s in _subjects) {
      final cc = _classControllers[s.id];
      final ec = _examControllers[s.id];
      if (cc == null || ec == null) continue;
      var cVal = double.tryParse(cc.text.trim()) ?? 0;
      var eVal = double.tryParse(ec.text.trim()) ?? 0;
      cVal = cVal.clamp(0, 100);
      eVal = eVal.clamp(0, 100);
      rows.add(
        GradeUpsertRow(
          subjectId: s.id,
          classScore: cVal,
          examScore: eVal,
        ),
      );
    }

    if (rows.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('No subjects to save.'),
          backgroundColor: AppColors.error,
        ),
      );
      return;
    }

    setState(() => _saveBusy = true);
    try {
      await ref.read(gradesRepositoryProvider).saveGrades(
            studentId: studentId,
            term: term,
            grades: rows,
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Results saved',
            style: TextStyle(fontWeight: FontWeight.bold),
          ),
          backgroundColor: Colors.green,
        ),
      );
    } on DioException catch (e) {
      if (!mounted) return;
      final msg = e.response?.data is Map<String, dynamic>
          ? (e.response!.data['error'] as String? ?? '$e')
          : '$e';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(msg), backgroundColor: AppColors.error),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('$e'),
          backgroundColor: AppColors.error,
        ),
      );
    } finally {
      if (mounted) setState(() => _saveBusy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(authProvider);
    final isReadOnly = _computeReadOnly(session);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text(
          'Input results',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: AppColors.secondary,
        actions: [
          if (!isReadOnly)
            IconButton(
              icon: _saveBusy
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(LucideIcons.save),
              onPressed: _saveBusy || _loading ? null : _save,
            ),
        ],
      ),
      body: Column(
        children: [
          if (isReadOnly)
            Container(
              width: double.infinity,
              margin: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: Colors.orange.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: Colors.orange.withValues(alpha: 0.3),
                ),
              ),
              child: Row(
                children: [
                  Icon(LucideIcons.lock, size: 18, color: Colors.orange.shade700),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Text(
                      'View-only: enable “Allow teachers to enter results” in Security for teacher editing.',
                      style: TextStyle(
                        fontSize: 13,
                        color: AppColors.secondary,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
            decoration: BoxDecoration(
              color: AppColors.surface,
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.02),
                  blurRadius: 10,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withValues(alpha: 0.1),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    LucideIcons.clipboardSignature,
                    color: AppColors.secondary,
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        studentId.isEmpty ? '—' : studentId,
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 18,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        term,
                        style: const TextStyle(
                          color: AppColors.textSecondary,
                          fontSize: 13,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _loadError != null
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Text(
                            _loadError!,
                            textAlign: TextAlign.center,
                            style: const TextStyle(color: AppColors.error),
                          ),
                        ),
                      )
                    : _subjects.isEmpty
                        ? const Center(
                            child: Text(
                              'No subjects for this class.',
                              style: TextStyle(color: AppColors.textSecondary),
                            ),
                          )
                        : ListView.builder(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 24,
                              vertical: 8,
                            ),
                            itemCount: _subjects.length,
                            itemBuilder: (context, index) {
                              final sub = _subjects[index];
                              final cc = _classControllers[sub.id];
                              final ec = _examControllers[sub.id];
                              if (cc == null || ec == null) {
                                return const SizedBox.shrink();
                              }
                              return _buildSubjectGradeCard(
                                sub.name,
                                isReadOnly,
                                cc,
                                ec,
                              );
                            },
                          ),
          ),
        ],
      ),
    );
  }

  Widget _buildSubjectGradeCard(
    String name,
    bool isReadOnly,
    TextEditingController classCtrl,
    TextEditingController examCtrl,
  ) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: AppColors.background, width: 2),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            name,
            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: _buildGradeInputBox(
                  'Class score (30)',
                  classCtrl,
                  isReadOnly,
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: _buildGradeInputBox(
                  'Exam score (70)',
                  examCtrl,
                  isReadOnly,
                ),
              ),
              const SizedBox(width: 16),
              Column(
                children: [
                  const Text(
                    'Total',
                    style: TextStyle(
                      fontSize: 11,
                      color: AppColors.textSecondary,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Container(
                    width: 48,
                    height: 48,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: AppColors.primary.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      _total(classCtrl.text, examCtrl.text),
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        color: AppColors.secondary,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }

  String _total(String a, String b) {
    final t = (int.tryParse(a) ?? 0) + (int.tryParse(b) ?? 0);
    return t > 0 ? '$t' : '-';
  }

  Widget _buildGradeInputBox(
    String label,
    TextEditingController controller,
    bool isReadOnly,
  ) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            fontSize: 11,
            color: AppColors.textSecondary,
          ),
        ),
        const SizedBox(height: 8),
        Container(
          height: 48,
          decoration: BoxDecoration(
            color: isReadOnly ? AppColors.surface : AppColors.background,
            borderRadius: BorderRadius.circular(12),
          ),
          child: TextField(
            controller: controller,
            keyboardType: TextInputType.number,
            textAlign: TextAlign.center,
            readOnly: isReadOnly,
            enabled: !isReadOnly,
            decoration: const InputDecoration(
              border: InputBorder.none,
              hintText: '0',
            ),
            style: TextStyle(
              fontWeight: FontWeight.w600,
              color: isReadOnly ? AppColors.textSecondary : null,
            ),
            onChanged: (_) => setState(() {}),
          ),
        ),
      ],
    );
  }
}
