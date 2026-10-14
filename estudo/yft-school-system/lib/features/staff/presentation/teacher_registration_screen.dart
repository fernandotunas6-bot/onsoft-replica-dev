import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/utils/responsive_utils.dart';

class TeacherRegistrationScreen extends ConsumerStatefulWidget {
  final String? teacherId;
  const TeacherRegistrationScreen({super.key, this.teacherId});

  @override
  ConsumerState<TeacherRegistrationScreen> createState() =>
      _TeacherRegistrationScreenState();
}

class _TeacherRegistrationScreenState
    extends ConsumerState<TeacherRegistrationScreen> {
  final _formKey = GlobalKey<FormState>();

  final _firstNameController = TextEditingController();
  final _lastNameController = TextEditingController();
  final _emailController = TextEditingController();
  final _phoneController = TextEditingController();
  final _residentialAddressController = TextEditingController();
  final _primaryQualificationController = TextEditingController();
  final _yearsOfExperienceController = TextEditingController();
  final _subjectsController = TextEditingController();
  final _ssnItNumberController = TextEditingController();
  final _maritalStatusController = TextEditingController();
  final _emergencyContactNameController = TextEditingController();
  final _emergencyContactPhoneController = TextEditingController();
  final _bankNameController = TextEditingController();
  final _accountNumberController = TextEditingController();
  final _accountHolderNameController = TextEditingController();

  String _gender = 'Male';
  DateTime? _dob;
  XFile? _pickedPhoto;
  Uint8List? _photoPreviewBytes;
  bool _submitting = false;

  static const _fieldStyle = TextStyle(fontSize: 16, height: 1.35);
  static const _contentPadding =
      EdgeInsets.symmetric(vertical: 18, horizontal: 16);

  @override
  void dispose() {
    _firstNameController.dispose();
    _lastNameController.dispose();
    _emailController.dispose();
    _phoneController.dispose();
    _residentialAddressController.dispose();
    _primaryQualificationController.dispose();
    _yearsOfExperienceController.dispose();
    _subjectsController.dispose();
    _ssnItNumberController.dispose();
    _maritalStatusController.dispose();
    _emergencyContactNameController.dispose();
    _emergencyContactPhoneController.dispose();
    _bankNameController.dispose();
    _accountNumberController.dispose();
    _accountHolderNameController.dispose();
    super.dispose();
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
          _dob ?? DateTime.now().subtract(const Duration(days: 365 * 25)),
      firstDate: DateTime(1960),
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

    setState(() => _submitting = true);
    try {
      String? photoKey;
      if (_pickedPhoto != null) {
        photoKey = await ref
            .read(mediaRepositoryProvider)
            .uploadProfilePhotoXFile(_pickedPhoto!);
      }

      final first = _firstNameController.text.trim();
      final last = _lastNameController.text.trim();
      final fullName = '$first $last'.trim();

      final years = int.tryParse(_yearsOfExperienceController.text.trim());

      await ref.read(userRepositoryProvider).registerTeacher(
            name: fullName,
            phone: _phoneController.text.trim(),
            email: _emailController.text.trim().isEmpty
                ? null
                : _emailController.text.trim(),
            gender: _gender,
            photoUrl: photoKey,
            residentialAddress:
                _residentialAddressController.text.trim().isEmpty
                    ? null
                    : _residentialAddressController.text.trim(),
            qualification:
                _primaryQualificationController.text.trim().isEmpty
                    ? null
                    : _primaryQualificationController.text.trim(),
            yearsExperience: years,
            subjectsText: _subjectsController.text.trim().isEmpty
                ? null
                : _subjectsController.text.trim(),
            ssnitNumber: _ssnItNumberController.text.trim().isEmpty
                ? null
                : _ssnItNumberController.text.trim(),
            maritalStatus: _maritalStatusController.text.trim().isEmpty
                ? null
                : _maritalStatusController.text.trim(),
            emergencyContactName:
                _emergencyContactNameController.text.trim().isEmpty
                    ? null
                    : _emergencyContactNameController.text.trim(),
            emergencyContactPhone:
                _emergencyContactPhoneController.text.trim().isEmpty
                    ? null
                    : _emergencyContactPhoneController.text.trim(),
            bankName: _bankNameController.text.trim().isEmpty
                ? null
                : _bankNameController.text.trim(),
            bankAccountNumber: _accountNumberController.text.trim().isEmpty
                ? null
                : _accountNumberController.text.trim(),
            bankAccountHolder: _accountHolderNameController.text.trim().isEmpty
                ? null
                : _accountHolderNameController.text.trim(),
            dateOfBirth: _dobIso(),
          );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Teacher registered successfully'),
            backgroundColor: Colors.green,
          ),
        );
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('$e'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Widget _photoAvatar() {
    final Widget child;
    if (_photoPreviewBytes != null) {
      child = ClipOval(
        child: Image.memory(
          _photoPreviewBytes!,
          width: 128,
          height: 128,
          fit: BoxFit.cover,
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
    if (widget.teacherId != null) {
      return Scaffold(
        backgroundColor: AppColors.background,
        appBar: AppBar(
          title: const Text(
            'Edit teacher',
            style: TextStyle(fontWeight: FontWeight.bold),
          ),
          backgroundColor: Colors.transparent,
          elevation: 0,
          foregroundColor: AppColors.secondary,
        ),
        body: Center(
          child: Padding(
            padding: getResponsiveHorizontalPadding(context),
            child: const Text(
              'Editing teacher records from this screen is not available yet.',
              textAlign: TextAlign.center,
              style: TextStyle(color: AppColors.textSecondary, fontSize: 16),
            ),
          ),
        ),
      );
    }

    final narrow = getScreenSize(context) == ScreenSize.mobile;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text(
          'New teacher registration',
          style: TextStyle(fontWeight: FontWeight.bold),
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
                  'Personal information',
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
                if (narrow) ...[
                  TextFormField(
                    controller: _firstNameController,
                    style: _fieldStyle,
                    decoration: _decoration('First name', LucideIcons.user),
                    validator: (v) =>
                        v == null || v.trim().isEmpty ? 'Required' : null,
                  ),
                  const SizedBox(height: 18),
                  TextFormField(
                    controller: _lastNameController,
                    style: _fieldStyle,
                    decoration: _decoration('Last name', LucideIcons.user),
                    validator: (v) =>
                        v == null || v.trim().isEmpty ? 'Required' : null,
                  ),
                ] else
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: TextFormField(
                          controller: _firstNameController,
                          style: _fieldStyle,
                          decoration:
                              _decoration('First name', LucideIcons.user),
                          validator: (v) =>
                              v == null || v.trim().isEmpty ? 'Required' : null,
                        ),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: TextFormField(
                          controller: _lastNameController,
                          style: _fieldStyle,
                          decoration:
                              _decoration('Last name', LucideIcons.user),
                          validator: (v) =>
                              v == null || v.trim().isEmpty ? 'Required' : null,
                        ),
                      ),
                    ],
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
                TextFormField(
                  controller: _emailController,
                  style: _fieldStyle,
                  keyboardType: TextInputType.emailAddress,
                  decoration: _decoration(
                    'Email (optional)',
                    LucideIcons.mail,
                  ),
                ),
                const SizedBox(height: 18),
                TextFormField(
                  controller: _phoneController,
                  style: _fieldStyle,
                  keyboardType: TextInputType.phone,
                  decoration: _decoration(
                    'Phone number',
                    LucideIcons.phone,
                  ),
                  validator: (v) =>
                      v == null || v.trim().isEmpty ? 'Required' : null,
                ),
                const SizedBox(height: 18),
                TextFormField(
                  controller: _residentialAddressController,
                  style: _fieldStyle,
                  maxLines: 3,
                  decoration: _decoration(
                    'Residential address',
                    LucideIcons.mapPin,
                  ),
                ),
                const SizedBox(height: 36),
                const Text(
                  'Professional information',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: AppColors.secondary,
                  ),
                ),
                const SizedBox(height: 18),
                TextFormField(
                  controller: _primaryQualificationController,
                  style: _fieldStyle,
                  decoration: _decoration(
                    'Primary qualification',
                    LucideIcons.award,
                  ),
                ),
                const SizedBox(height: 18),
                TextFormField(
                  controller: _yearsOfExperienceController,
                  style: _fieldStyle,
                  keyboardType: TextInputType.number,
                  decoration: _decoration(
                    'Years of experience (optional)',
                    LucideIcons.briefcase,
                  ),
                ),
                const SizedBox(height: 18),
                TextFormField(
                  controller: _subjectsController,
                  style: _fieldStyle,
                  maxLines: 3,
                  decoration: _decoration(
                    'Subjects / specialization',
                    LucideIcons.bookOpen,
                  ),
                ),
                const SizedBox(height: 36),
                const Text(
                  'Government & personal',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: AppColors.secondary,
                  ),
                ),
                const SizedBox(height: 18),
                TextFormField(
                  controller: _ssnItNumberController,
                  style: _fieldStyle,
                  decoration: _decoration(
                    'SSNIT number (optional)',
                    LucideIcons.creditCard,
                  ),
                ),
                const SizedBox(height: 18),
                TextFormField(
                  controller: _maritalStatusController,
                  style: _fieldStyle,
                  decoration: _decoration(
                    'Marital status (optional)',
                    LucideIcons.heart,
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
                  'Bank details',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: AppColors.secondary,
                  ),
                ),
                const SizedBox(height: 18),
                TextFormField(
                  controller: _bankNameController,
                  style: _fieldStyle,
                  decoration: _decoration(
                    'Bank name (optional)',
                    LucideIcons.building2,
                  ),
                ),
                const SizedBox(height: 18),
                TextFormField(
                  controller: _accountNumberController,
                  style: _fieldStyle,
                  decoration: _decoration(
                    'Account number (optional)',
                    LucideIcons.hash,
                  ),
                ),
                const SizedBox(height: 18),
                TextFormField(
                  controller: _accountHolderNameController,
                  style: _fieldStyle,
                  decoration: _decoration(
                    'Account holder (optional)',
                    LucideIcons.user,
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
                        : const Text(
                            'Complete registration',
                            style: TextStyle(fontSize: 16),
                          ),
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  'Login details are emailed or generated from the phone number where no email is set.',
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

  Widget _buildGenderDropdown() {
    return DropdownButtonFormField<String>(
      // ignore: deprecated_member_use
      value: _gender,
      style: _fieldStyle,
      decoration: const InputDecoration(
        labelText: 'Gender',
        prefixIcon: Icon(LucideIcons.users, size: 22),
        contentPadding: _contentPadding,
      ),
      items: ['Male', 'Female', 'Other']
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
          labelText: 'Date of birth (optional)',
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
}
