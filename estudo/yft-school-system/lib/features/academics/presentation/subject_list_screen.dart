import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/models/subject.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';

class SubjectListScreen extends ConsumerStatefulWidget {
  const SubjectListScreen({super.key});

  @override
  ConsumerState<SubjectListScreen> createState() => _SubjectListScreenState();
}

class _SubjectListScreenState extends ConsumerState<SubjectListScreen> {
  String _searchQuery = '';
  final _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final subjectsAsync = ref.watch(subjectsProvider(null));
    final classesAsync = ref.watch(classesProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text(
          'Subject Manager',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: AppColors.secondary,
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showSubjectSheet(),
        backgroundColor: AppColors.primary,
        child: const Icon(LucideIcons.plus, color: AppColors.secondary),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
            child: TextField(
              controller: _searchController,
              onChanged: (v) => setState(() => _searchQuery = v),
              decoration: InputDecoration(
                hintText: 'Search subjects...',
                prefixIcon: const Icon(LucideIcons.search, size: 20),
                fillColor: AppColors.surface,
                filled: true,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(16),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
          ),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 24.0, vertical: 8.0),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'Tap a subject to manage class assignments.',
                style: TextStyle(color: AppColors.textSecondary, fontSize: 13),
              ),
            ),
          ),
          Expanded(
            child: subjectsAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (error, _) => Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(
                      LucideIcons.alertTriangle,
                      size: 48,
                      color: AppColors.error,
                    ),
                    const SizedBox(height: 16),
                    const Text('Failed to load subjects'),
                    const SizedBox(height: 16),
                    ElevatedButton(
                      onPressed: () => ref.invalidate(subjectsProvider(null)),
                      child: const Text('Retry'),
                    ),
                  ],
                ),
              ),
              data: (subjects) {
                final classMap = <String, String>{};
                final classesValue = classesAsync.whenOrNull(
                  data: (classes) => classes,
                );
                if (classesValue != null) {
                  for (final c in classesValue) {
                    classMap[c.id] = c.className;
                  }
                }

                final filtered = _searchQuery.isEmpty
                    ? subjects
                    : subjects
                          .where(
                            (s) => s.name.toLowerCase().contains(
                              _searchQuery.toLowerCase(),
                            ),
                          )
                          .toList();

                if (filtered.isEmpty) {
                  return Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          LucideIcons.book,
                          size: 56,
                          color: AppColors.textSecondary.withValues(alpha: 0.3),
                        ),
                        const SizedBox(height: 16),
                        const Text(
                          'No subjects found.',
                          style: TextStyle(
                            color: AppColors.textSecondary,
                            fontSize: 14,
                          ),
                        ),
                      ],
                    ),
                  );
                }

                return RefreshIndicator(
                  onRefresh: () async => ref.invalidate(subjectsProvider(null)),
                  child: ListView.builder(
                    padding: const EdgeInsets.symmetric(horizontal: 24),
                    itemCount: filtered.length,
                    itemBuilder: (context, index) {
                      final sub = filtered[index];
                      final classNames = sub.classIds
                          .map((id) => classMap[id] ?? id)
                          .join(', ');

                      return Container(
                        margin: const EdgeInsets.only(bottom: 12),
                        decoration: BoxDecoration(
                          color: AppColors.surface,
                          borderRadius: BorderRadius.circular(20),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.02),
                              blurRadius: 10,
                              offset: const Offset(0, 4),
                            ),
                          ],
                        ),
                        child: InkWell(
                          borderRadius: BorderRadius.circular(20),
                          onTap: () => _showSubjectSheet(subject: sub),
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: ListTile(
                              contentPadding: EdgeInsets.zero,
                              leading: Container(
                                padding: const EdgeInsets.all(10),
                                decoration: BoxDecoration(
                                  color: AppColors.secondary.withValues(
                                    alpha: 0.1,
                                  ),
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: const Icon(
                                  LucideIcons.book,
                                  color: AppColors.secondary,
                                ),
                              ),
                              title: Text(
                                sub.name,
                                style: const TextStyle(
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              subtitle: Text(
                                classNames.isNotEmpty
                                    ? 'Assigned to: $classNames'
                                    : 'Not assigned to any class',
                                style: const TextStyle(
                                  color: AppColors.textSecondary,
                                  fontSize: 13,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              trailing: const Icon(
                                LucideIcons.chevronRight,
                                color: AppColors.textSecondary,
                              ),
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  void _showSubjectSheet({Subject? subject}) {
    final nameController = TextEditingController(text: subject?.name ?? '');
    final availableClasses =
        ref.read(classesProvider).whenOrNull(data: (d) => d) ?? [];
    final selectedClassIds = <String>{...subject?.classIds ?? []};
    var isSaving = false;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, setSheetState) {
          Future<void> saveSubject() async {
            final subjectName = nameController.text.trim();
            if (subjectName.isEmpty || selectedClassIds.isEmpty) {
              return;
            }

            setSheetState(() => isSaving = true);
            try {
              if (subject == null) {
                await ref
                    .read(subjectRepositoryProvider)
                    .createSubject(
                      name: subjectName,
                      classIds: selectedClassIds.toList(),
                    );
              } else {
                await ref
                    .read(subjectRepositoryProvider)
                    .updateSubject(
                      subjectId: subject.id,
                      name: subjectName,
                      classIds: selectedClassIds.toList(),
                    );
              }
              ref.invalidate(subjectsProvider(null));
              if (sheetContext.mounted) Navigator.pop(sheetContext);
            } catch (e) {
              setSheetState(() => isSaving = false);
              if (sheetContext.mounted) {
                ScaffoldMessenger.of(sheetContext).showSnackBar(
                  SnackBar(
                    content: Text(
                      subject == null
                          ? 'Failed to create subject: $e'
                          : 'Failed to update subject: $e',
                    ),
                    backgroundColor: AppColors.error,
                  ),
                );
              }
            }
          }

          return Container(
            decoration: const BoxDecoration(
              color: AppColors.background,
              borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
            ),
            padding: EdgeInsets.fromLTRB(
              24,
              20,
              24,
              MediaQuery.of(sheetContext).viewInsets.bottom + 24,
            ),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(
                    child: Container(
                      width: 48,
                      height: 5,
                      decoration: BoxDecoration(
                        color: AppColors.textSecondary.withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(999),
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),
                  Text(
                    subject == null
                        ? 'Add New Subject'
                        : 'Manage Subject Classes',
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: nameController,
                    decoration: const InputDecoration(
                      hintText: 'Subject Name',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'Assign to Classes',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),
                  ...availableClasses.map(
                    (cls) => CheckboxListTile(
                      title: Text(cls.className),
                      value: selectedClassIds.contains(cls.id),
                      onChanged: (value) {
                        setSheetState(() {
                          if (value == true) {
                            selectedClassIds.add(cls.id);
                          } else {
                            selectedClassIds.remove(cls.id);
                          }
                        });
                      },
                      contentPadding: EdgeInsets.zero,
                    ),
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: isSaving ? null : saveSubject,
                      child: isSaving
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : Text(
                              subject == null
                                  ? 'Create Subject'
                                  : 'Save Changes',
                            ),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
