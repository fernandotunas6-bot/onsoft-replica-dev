import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/models/parent_user.dart';
import 'package:yft_school_system/core/models/school_class.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';
import 'package:yft_school_system/core/network/api_client.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/utils/media_url.dart';
import 'package:yft_school_system/core/utils/responsive_utils.dart';

/// New admission only: link an account that already exists vs enter details (creates/matches by phone).
enum _ParentAdmissionMode { linkExisting, registerNew }

class StudentAdmissionScreen extends ConsumerStatefulWidget {
  final String? studentId;
  const StudentAdmissionScreen({super.key, this.studentId});

  @override
  ConsumerState<StudentAdmissionScreen> createState() =>
      _StudentAdmissionScreenState();
}

class _StudentAdmissionScreenState extends ConsumerState<StudentAdmissionScreen> {
  final _formKey = GlobalKey<FormState>();

  final _studentNameController = TextEditingController();
  final _parentNameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _emailController = TextEditingController();
  final _previousSchoolController = TextEditingController();
  final _emergencyContactNameController = TextEditingController();
  final _emergencyContactPhoneController = TextEditingController();
  final _bloodGroupController = TextEditingController();
  final _medicalConditionsController = TextEditingController();
  final _residentialAddressController = TextEditingController();

  String _gender = 'Male';
  String? _selectedClassId;
  DateTime? _dob;
  XFile? _pickedPhoto;
  Uint8List? _photoPreviewBytes;
  bool _submitting = false;
  bool _existingHydrated = false;
  String? _existingLoadError;
  String? _existingPhotoKey;

  _ParentAdmissionMode _parentMode = _ParentAdmissionMode.registerNew;
  final _parentSearchController = TextEditingController();
  ParentUser? _selectedExistingParent;
  List<ParentUser> _parentSearchResults = [];
  bool _searchingParents = false;
  Timer? _parentSearchDebounce;

  @override
  void initState() {
    super.initState();
    if (widget.studentId != null) {
      WidgetsBinding.instance
          .addPostFrameCallback((_) => _loadExistingStudent());
    } else {
      _existingHydrated = true;
    }
  }

  static const _fieldStyle = TextStyle(fontSize: 16, height: 1.35);
  static const _contentPadding =
      EdgeInsets.symmetric(vertical: 18, horizontal: 16);

  Future<void> _loadExistingStudent() async {
    final id = widget.studentId;
    if (id == null) return;
    try {
      final s = await ref.read(studentRepositoryProvider).getStudentById(id);
      if (!mounted) return;
      setState(() {
        _studentNameController.text = s.name;
        _parentNameController.text = s.parentName ?? '';
        _phoneController.text = s.parentPhone ?? '';
        _emailController.text = s.parentEmail ?? '';
        _previousSchoolController.text = s.previousSchool ?? '';
        _emergencyContactNameController.text = s.emergencyContactName ?? '';
        _emergencyContactPhoneController.text = s.emergencyContactPhone ?? '';
        _bloodGroupController.text = s.bloodGroup ?? '';
        _medicalConditionsController.text = s.medicalNotes ?? '';
        _residentialAddressController.text = s.address ?? '';
        _selectedClassId = s.classId;
        _existingPhotoKey = s.photoUrl;
        if (s.gender != null && s.gender!.trim().isNotEmpty) {
          _gender = s.gender!.trim();
        }
        if (s.dob != null) {
          final parsed = DateTime.tryParse(s.dob!);
          if (parsed != null) _dob = parsed;
        }
        _existingHydrated = true;
        _existingLoadError = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _existingLoadError = '$e';
        _existingHydrated = true;
      });
    }
  }

  @override
  void dispose() {
    _studentNameController.dispose();
    _parentNameController.dispose();
    _phoneController.dispose();
    _emailController.dispose();
    _previousSchoolController.dispose();
    _emergencyContactNameController.dispose();
    _emergencyContactPhoneController.dispose();
    _bloodGroupController.dispose();
    _medicalConditionsController.dispose();
    _residentialAddressController.dispose();
    _parentSearchController.dispose();
    _parentSearchDebounce?.cancel();
    super.dispose();
  }

  void _onParentModeChanged(_ParentAdmissionMode mode) {
    setState(() {
      _parentMode = mode;
      _selectedExistingParent = null;
      _parentSearchResults = [];
      _parentSearchController.clear();
    });
    if (mode == _ParentAdmissionMode.linkExisting) {
      _loadParentSuggestions('');
    }
  }

  Future<void> _loadParentSuggestions(String query) async {
    setState(() => _searchingParents = true);
    try {
      final list = await ref
          .read(studentRepositoryProvider)
          .searchParents(query: query);
      if (!mounted) return;
      setState(() {
        _parentSearchResults = list;
        _searchingParents = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _parentSearchResults = [];
        _searchingParents = false;
      });
    }
  }

  void _onParentSearchTextChanged(String raw) {
    _parentSearchDebounce?.cancel();
    _parentSearchDebounce = Timer(const Duration(milliseconds: 400), () {
      if (!mounted) return;
      _loadParentSuggestions(raw.trim());
    });
  }

  bool get _isNewAdmission => widget.studentId == null;

  bool get _useLinkedParent =>
      _isNewAdmission && _parentMode == _ParentAdmissionMode.linkExisting;

  String _formatSelectedParentSubtitle(ParentUser p) {
    final email = p.email?.trim();
    final emailBit =
        (email != null && email.isNotEmpty) ? ' · $email' : '';
    return '${p.phone}$emailBit\n'
        '${p.studentCount} child(ren) at this school';
  }

  InputDecoration _decoration(String hint, IconData icon) {
    return InputDecoration(
      hintText: hint,
      prefixIcon: Icon(icon, size: 22),
      contentPadding: _contentPadding,
    );
  }

  Future<void> _pickPhoto() async {
    final picker = ImagePicker();
    final file = await picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 1600,
      imageQuality: 85,
    );
    if (file != null) {
      final bytes = await file.readAsBytes();
      setState(() {
        _pickedPhoto = file;
        _photoPreviewBytes = bytes;
      });
    }
  }

  Future<void> _selectDate(BuildContext context) async {
    final picked = await showDatePicker(
      context: context,
      initialDate:
          _dob ?? DateTime.now().subtract(const Duration(days: 365 * 6)),
      firstDate: DateTime(2000),
      lastDate: DateTime.now(),
    );
    if (picked != null) {
      setState(() => _dob = picked);
    }
  }

  String? _dobIso() {
    if (_dob == null) return null;
    final y = _dob!.year.toString().padLeft(4, '0');
    final m = _dob!.month.toString().padLeft(2, '0');
    final d = _dob!.day.toString().padLeft(2, '0');
    return '$y-$m-$d';
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    final messenger = ScaffoldMessenger.of(context);

    final classes = await ref.read(classesProvider.future);
    final sorted = _sortClasses(classes);
    final classId = (_selectedClassId != null &&
            sorted.any((c) => c.id == _selectedClassId))
        ? _selectedClassId!
        : (sorted.isEmpty ? null : sorted.first.id);
    if (classId == null || classId.isEmpty) {
      messenger.showSnackBar(
        const SnackBar(
          content: Text('No class available. Create a class first.'),
          backgroundColor: AppColors.error,
        ),
      );
      return;
    }
    if (_dob == null) {
      messenger.showSnackBar(
        const SnackBar(
          content: Text('Please select date of birth'),
          backgroundColor: AppColors.error,
        ),
      );
      return;
    }

    if (_isNewAdmission && _useLinkedParent && _selectedExistingParent == null) {
      messenger.showSnackBar(
        const SnackBar(
          content: Text('Select an existing parent from the list'),
          backgroundColor: AppColors.error,
        ),
      );
      return;
    }

    setState(() => _submitting = true);
    try {
      String? photoKey;
      if (_pickedPhoto != null) {
        photoKey = await ref
            .read(mediaRepositoryProvider)
            .uploadProfilePhotoXFile(_pickedPhoto!);
      }

      final editId = widget.studentId;
      if (editId != null) {
        await ref.read(studentRepositoryProvider).updateStudent(
              editId,
              name: _studentNameController.text.trim(),
              classId: classId,
              dob: _dobIso(),
              gender: _gender,
              photoUrl: photoKey,
              previousSchool: _previousSchoolController.text.trim().isEmpty
                  ? null
                  : _previousSchoolController.text.trim(),
              address: _residentialAddressController.text.trim().isEmpty
                  ? null
                  : _residentialAddressController.text.trim(),
              emergencyContactName:
                  _emergencyContactNameController.text.trim().isEmpty
                      ? null
                      : _emergencyContactNameController.text.trim(),
              emergencyContactPhone:
                  _emergencyContactPhoneController.text.trim().isEmpty
                      ? null
                      : _emergencyContactPhoneController.text.trim(),
              bloodGroup: _bloodGroupController.text.trim().isEmpty
                  ? null
                  : _bloodGroupController.text.trim(),
              medicalNotes: _medicalConditionsController.text.trim().isEmpty
                  ? null
                  : _medicalConditionsController.text.trim(),
              parentName: _parentNameController.text.trim(),
              parentPhone: _phoneController.text.trim(),
              parentEmail: _emailController.text.trim().isEmpty
                  ? null
                  : _emailController.text.trim(),
            );
        ref.invalidate(studentByIdProvider(editId));
      } else {
        final linked = _selectedExistingParent;
        await ref.read(studentRepositoryProvider).createStudent(
              name: _studentNameController.text.trim(),
              classId: classId,
              dob: _dobIso(),
              gender: _gender,
              parentUid: (_useLinkedParent && linked != null)
                  ? linked.uid
                  : null,
              parentName: _useLinkedParent ? null : _parentNameController.text.trim(),
              parentPhone: _useLinkedParent ? null : _phoneController.text.trim(),
              parentEmail: _useLinkedParent
                  ? null
                  : (_emailController.text.trim().isEmpty
                      ? null
                      : _emailController.text.trim()),
              photoUrl: photoKey,
              previousSchool: _previousSchoolController.text.trim().isEmpty
                  ? null
                  : _previousSchoolController.text.trim(),
              address: _residentialAddressController.text.trim().isEmpty
                  ? null
                  : _residentialAddressController.text.trim(),
              emergencyContactName:
                  _emergencyContactNameController.text.trim().isEmpty
                      ? null
                      : _emergencyContactNameController.text.trim(),
              emergencyContactPhone:
                  _emergencyContactPhoneController.text.trim().isEmpty
                      ? null
                      : _emergencyContactPhoneController.text.trim(),
              bloodGroup: _bloodGroupController.text.trim().isEmpty
                  ? null
                  : _bloodGroupController.text.trim(),
              medicalNotes: _medicalConditionsController.text.trim().isEmpty
                  ? null
                  : _medicalConditionsController.text.trim(),
            );
      }

      ref.invalidate(
        studentsProvider((classId: classId, page: 1)),
      );
      ref.invalidate(studentsProvider((classId: null, page: 1)));
      ref.invalidate(arrearsProvider);

      if (!mounted) return;
      messenger.showSnackBar(
        SnackBar(
          content: Text(editId != null
              ? 'Student updated'
              : 'Admission completed successfully'),
          backgroundColor: Colors.green,
        ),
      );
      Navigator.pop(context);
    } catch (e) {
      if (!mounted) return;
      messenger.showSnackBar(
        SnackBar(
          content: Text('$e'),
          backgroundColor: AppColors.error,
        ),
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Widget _photoAvatar() {
    final apiBase = ref.read(dioProvider).options.baseUrl;
    final existingUrl = profilePhotoUrlFromKey(_existingPhotoKey, apiBase);

    Widget child;
    if (_photoPreviewBytes != null) {
      child = ClipOval(
        child: Image.memory(
          _photoPreviewBytes!,
          width: 128,
          height: 128,
          fit: BoxFit.cover,
        ),
      );
    } else if (existingUrl != null) {
      child = ClipOval(
        child: Image.network(
          existingUrl,
          width: 128,
          height: 128,
          fit: BoxFit.cover,
          errorBuilder: (_, _, _) => const Icon(
            LucideIcons.camera,
            size: 48,
            color: AppColors.primary,
          ),
        ),
      );
    } else {
      child = const Icon(
        LucideIcons.camera,
        size: 48,
        color: AppColors.primary,
      );
    }

    return GestureDetector(
      onTap: _pickPhoto,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Container(
            width: 128,
            height: 128,
            decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: 0.1),
              shape: BoxShape.circle,
              border: Border.all(
                color: AppColors.primary.withValues(alpha: 0.35),
                width: 2,
              ),
            ),
            child: child,
          ),
          Positioned(
            bottom: 2,
            right: 2,
            child: Container(
              padding: const EdgeInsets.all(10),
              decoration: const BoxDecoration(
                color: AppColors.primary,
                shape: BoxShape.circle,
              ),
              child: const Icon(
                LucideIcons.plus,
                size: 18,
                color: Colors.white,
              ),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (widget.studentId != null) {
      if (!_existingHydrated && _existingLoadError == null) {
        return Scaffold(
          backgroundColor: AppColors.background,
          appBar: AppBar(
            title: const Text(
              'Edit student',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
            backgroundColor: Colors.transparent,
            elevation: 0,
            foregroundColor: AppColors.secondary,
          ),
          body: const Center(child: CircularProgressIndicator()),
        );
      }
      if (_existingLoadError != null) {
        return Scaffold(
          backgroundColor: AppColors.background,
          appBar: AppBar(
            title: const Text(
              'Edit student',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
            backgroundColor: Colors.transparent,
            elevation: 0,
            foregroundColor: AppColors.secondary,
          ),
          body: Center(
            child: Padding(
              padding: getResponsiveHorizontalPadding(context),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    _existingLoadError!,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: AppColors.error),
                  ),
                  const SizedBox(height: 16),
                  TextButton(
                    onPressed: () {
                      setState(() {
                        _existingHydrated = false;
                        _existingLoadError = null;
                      });
                      _loadExistingStudent();
                    },
                    child: const Text('Retry'),
                  ),
                ],
              ),
            ),
          ),
        );
      }
    }

    final classesAsync = ref.watch(classesProvider);
    final narrow = getScreenSize(context) == ScreenSize.mobile;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: Text(
          widget.studentId != null ? 'Edit student' : 'New admission',
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: AppColors.secondary,
      ),
      body: SingleChildScrollView(
        padding: getResponsiveHorizontalPadding(context).copyWith(
          top: 24,
          bottom: MediaQuery.of(context).padding.bottom + 120,
        ),
        child: ResponsiveConstrainedContent(
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'Student information',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: AppColors.secondary,
                  ),
                ),
                const SizedBox(height: 20),
                Center(child: _photoAvatar()),
                const SizedBox(height: 8),
                Center(
                  child: Text(
                    'Tap to add photo',
                    style: TextStyle(
                      fontSize: 13,
                      color: AppColors.textSecondary.withValues(alpha: 0.9),
                    ),
                  ),
                ),
                const SizedBox(height: 28),
                TextFormField(
                  controller: _studentNameController,
                  style: _fieldStyle,
                  decoration: _decoration(
                    'Student full name',
                    LucideIcons.user,
                  ),
                  validator: (v) =>
                      v == null || v.trim().isEmpty ? 'Required' : null,
                ),
                const SizedBox(height: 18),
                if (narrow) ...[
                  _buildGenderDropdown(),
                  const SizedBox(height: 18),
                  _buildDatePickerTile(context),
                ] else
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(child: _buildGenderDropdown()),
                      const SizedBox(width: 16),
                      Expanded(child: _buildDatePickerTile(context)),
                    ],
                  ),
                const SizedBox(height: 18),
                classesAsync.when(
                  loading: () => const Center(
                    child: Padding(
                      padding: EdgeInsets.all(24),
                      child: CircularProgressIndicator(),
                    ),
                  ),
                  error: (e, _) => Text(
                    'Could not load classes: $e',
                    style: const TextStyle(color: AppColors.error),
                  ),
                  data: (classes) => _buildClassDropdown(_sortClasses(classes)),
                ),
                const SizedBox(height: 18),
                TextFormField(
                  controller: _previousSchoolController,
                  style: _fieldStyle,
                  decoration: _decoration(
                    'Previous school (optional)',
                    LucideIcons.school,
                  ),
                ),
                const SizedBox(height: 36),
                const Text(
                  'Parent / guardian',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: AppColors.secondary,
                  ),
                ),
                const SizedBox(height: 18),
                if (_isNewAdmission) ...[
                  _buildParentModeToggle(),
                  const SizedBox(height: 20),
                  if (_useLinkedParent) _buildLinkExistingParentBlock(),
                ],
                if (!_useLinkedParent) ...[
                  TextFormField(
                    controller: _parentNameController,
                    style: _fieldStyle,
                    decoration: _decoration(
                      'Parent full name',
                      LucideIcons.contact,
                    ),
                    validator: (v) {
                      if (_useLinkedParent) return null;
                      return v == null || v.trim().isEmpty ? 'Required' : null;
                    },
                  ),
                  const SizedBox(height: 18),
                  TextFormField(
                    controller: _phoneController,
                    style: _fieldStyle,
                    keyboardType: TextInputType.phone,
                    decoration: _decoration(
                      'Mobile number (primary)',
                      LucideIcons.phone,
                    ),
                    validator: (v) {
                      if (_useLinkedParent) return null;
                      return v == null || v.trim().isEmpty ? 'Required' : null;
                    },
                  ),
                  const SizedBox(height: 18),
                  TextFormField(
                    controller: _emailController,
                    style: _fieldStyle,
                    keyboardType: TextInputType.emailAddress,
                    decoration: _decoration(
                      'Email (optional)',
                      LucideIcons.mail,
                    ),
                  ),
                ],
                const SizedBox(height: 18),
                TextFormField(
                  controller: _residentialAddressController,
                  style: _fieldStyle,
                  maxLines: 3,
                  decoration: _decoration(
                    'Home / residential address',
                    LucideIcons.mapPin,
                  ),
                ),
                const SizedBox(height: 36),
                const Text(
                  'Emergency contact',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: AppColors.secondary,
                  ),
                ),
                const SizedBox(height: 18),
                TextFormField(
                  controller: _emergencyContactNameController,
                  style: _fieldStyle,
                  decoration: _decoration(
                    'Emergency contact name',
                    LucideIcons.alertCircle,
                  ),
                ),
                const SizedBox(height: 18),
                TextFormField(
                  controller: _emergencyContactPhoneController,
                  style: _fieldStyle,
                  keyboardType: TextInputType.phone,
                  decoration: _decoration(
                    'Emergency contact phone',
                    LucideIcons.phone,
                  ),
                ),
                const SizedBox(height: 36),
                const Text(
                  'Health',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: AppColors.secondary,
                  ),
                ),
                const SizedBox(height: 18),
                TextFormField(
                  controller: _bloodGroupController,
                  style: _fieldStyle,
                  decoration: _decoration(
                    'Blood group (optional)',
                    LucideIcons.droplet,
                  ),
                ),
                const SizedBox(height: 18),
                TextFormField(
                  controller: _medicalConditionsController,
                  style: _fieldStyle,
                  maxLines: 3,
                  decoration: _decoration(
                    'Medical notes / allergies (optional)',
                    LucideIcons.heartHandshake,
                  ),
                ),
                const SizedBox(height: 40),
                SizedBox(
                  height: 54,
                  child: ElevatedButton(
                    onPressed: _submitting ? null : _submit,
                    child: _submitting
                        ? const SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : Text(
                            widget.studentId != null
                                ? 'Save changes'
                                : 'Complete admission',
                            style: const TextStyle(fontSize: 16),
                          ),
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  _isNewAdmission && _parentMode == _ParentAdmissionMode.linkExisting
                      ? 'The student is linked to the selected parent account — no duplicate parent is created.'
                      : 'A parent account is created or matched by phone when needed.',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        fontSize: 13,
                        color: AppColors.textSecondary,
                      ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildParentModeToggle() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Attach parent',
          style: TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w600,
            color: AppColors.textSecondary.withValues(alpha: 0.95),
          ),
        ),
        const SizedBox(height: 12),
        SegmentedButton<_ParentAdmissionMode>(
          segments: [
            ButtonSegment(
              value: _ParentAdmissionMode.linkExisting,
              label: const Text('Existing'),
              icon: const Icon(LucideIcons.userCheck, size: 18),
            ),
            ButtonSegment(
              value: _ParentAdmissionMode.registerNew,
              label: const Text('New parent'),
              icon: const Icon(LucideIcons.userPlus, size: 18),
            ),
          ],
          selected: {_parentMode},
          onSelectionChanged: (Set<_ParentAdmissionMode> next) {
            if (next.isEmpty) return;
            _onParentModeChanged(next.first);
          },
        ),
      ],
    );
  }

  Widget _buildLinkExistingParentBlock() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _parentSearchController,
          style: _fieldStyle,
          decoration: _decoration(
            'Search parent by name or phone',
            LucideIcons.search,
          ).copyWith(
            suffixIcon: _searchingParents
                ? const Padding(
                    padding: EdgeInsets.all(12),
                    child: SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  )
                : null,
          ),
          onChanged: _onParentSearchTextChanged,
        ),
        const SizedBox(height: 12),
        if (_selectedExistingParent != null)
          Material(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(16),
            child: ListTile(
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 16,
                vertical: 8,
              ),
              leading: CircleAvatar(
                backgroundColor: AppColors.primary.withValues(alpha: 0.15),
                child: const Icon(
                  LucideIcons.userCheck,
                  color: AppColors.primary,
                ),
              ),
              title: Text(
                _selectedExistingParent!.name,
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
              subtitle: Text(
                _formatSelectedParentSubtitle(_selectedExistingParent!),
                style: const TextStyle(fontSize: 13),
              ),
              trailing: TextButton(
                onPressed: () {
                  setState(() {
                    _selectedExistingParent = null;
                  });
                  _loadParentSuggestions(_parentSearchController.text.trim());
                },
                child: const Text('Change'),
              ),
            ),
          )
        else if (_parentSearchResults.isNotEmpty)
          Container(
            constraints: const BoxConstraints(maxHeight: 220),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: AppColors.primary.withValues(alpha: 0.12),
              ),
            ),
            child: ListView.separated(
              shrinkWrap: true,
              itemCount: _parentSearchResults.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (context, i) {
                final p = _parentSearchResults[i];
                return ListTile(
                  title: Text(p.name),
                  subtitle: Text(
                    '${p.phone} · ${p.studentCount} child(ren)',
                    style: const TextStyle(fontSize: 13),
                  ),
                  onTap: () {
                    setState(() {
                      _selectedExistingParent = p;
                      _parentSearchResults = [];
                      _parentSearchController.clear();
                    });
                  },
                );
              },
            ),
          )
        else if (!_searchingParents)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              _parentSearchController.text.trim().isNotEmpty
                  ? 'No matching parents. Try another search or use “New parent”.'
                  : 'No parents found yet. Use “New parent” to register one first; then you can link siblings here.',
              style: TextStyle(
                fontSize: 13,
                color: AppColors.textSecondary.withValues(alpha: 0.95),
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildGenderDropdown() {
    return DropdownButtonFormField<String>(
      // Controlled selection; `value` is correct until FormField API stabilizes.
      // ignore: deprecated_member_use
      value: _gender,
      style: _fieldStyle,
      decoration: const InputDecoration(
        labelText: 'Gender',
        prefixIcon: Icon(LucideIcons.users, size: 22),
        contentPadding: _contentPadding,
      ),
      items: ['Male', 'Female']
          .map((v) => DropdownMenuItem(value: v, child: Text(v)))
          .toList(),
      onChanged: (v) => setState(() => _gender = v ?? 'Male'),
    );
  }

  Widget _buildDatePickerTile(BuildContext context) {
    return InkWell(
      onTap: () => _selectDate(context),
      borderRadius: BorderRadius.circular(12),
      child: InputDecorator(
        decoration: const InputDecoration(
          labelText: 'Date of birth',
          prefixIcon: Icon(LucideIcons.calendar, size: 22),
          contentPadding: _contentPadding,
        ),
        child: Text(
          _dob == null
              ? 'Select date'
              : '${_dob!.day}/${_dob!.month}/${_dob!.year}',
          style: TextStyle(
            fontSize: 16,
            color: _dob == null
                ? AppColors.textSecondary.withValues(alpha: 0.55)
                : AppColors.textPrimary,
          ),
        ),
      ),
    );
  }

  List<SchoolClass> _sortClasses(List<SchoolClass> classes) {
    final sorted = [...classes]
      ..sort((a, b) {
        final la = a.level ?? 999;
        final lb = b.level ?? 999;
        if (la != lb) return la.compareTo(lb);
        return a.className.compareTo(b.className);
      });
    return sorted;
  }

  Widget _buildClassDropdown(List<SchoolClass> sorted) {
    if (sorted.isEmpty) {
      return const Text(
        'No classes found. Create a class before admitting students.',
        style: TextStyle(color: AppColors.error),
      );
    }

    final viable = (_selectedClassId != null &&
            sorted.any((c) => c.id == _selectedClassId))
        ? _selectedClassId!
        : sorted.first.id;

    return DropdownButtonFormField<String>(
      // ignore: deprecated_member_use
      value: viable,
      style: _fieldStyle,
      decoration: const InputDecoration(
        labelText: 'Class',
        prefixIcon: Icon(LucideIcons.bookOpen, size: 22),
        contentPadding: _contentPadding,
      ),
      items: sorted
          .map(
            (c) => DropdownMenuItem(
              value: c.id,
              child: Text(c.className),
            ),
          )
          .toList(),
      onChanged: (v) => setState(() => _selectedClassId = v),
    );
  }
}
