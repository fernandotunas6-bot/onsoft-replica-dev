import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/auth/auth_state.dart';
import 'package:yft_school_system/core/models/user_profile.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/utils/responsive_utils.dart';
import 'package:yft_school_system/core/widgets/profile_photo_avatar.dart';
import 'package:yft_school_system/core/widgets/section_widgets.dart';
import 'package:image_picker/image_picker.dart';
import 'package:yft_school_system/core/network/api_client.dart';
import 'package:yft_school_system/core/utils/media_url.dart';
import 'package:yft_school_system/core/sga/sga_attendance.dart' show SgaRejected;
import 'package:yft_school_system/core/sga/sga_config.dart';
import 'package:yft_school_system/core/sga/sga_profile.dart';

/// Dados pessoais: o utilizador corrige nome, telefone e morada. O e-mail é
/// o da conta de entrada e só a administração o muda.
class PersonalInfoScreen extends ConsumerWidget {
  const PersonalInfoScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (sgaMode) return const _SgaPersonalInfo();
    final profileAsync = ref.watch(userProfileProvider);
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text(
          'Dados pessoais',
          style: TextStyle(fontWeight: FontWeight.w600),
        ),
      ),
      body: profileAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, _) => EmptyHint(
          icon: LucideIcons.wifiOff,
          message: 'Não foi possível carregar os seus dados.',
          action: TextButton(
            onPressed: () => ref.invalidate(userProfileProvider),
            child: const Text('Tentar de novo'),
          ),
        ),
        data: (profile) => _Form(profile: profile),
      ),
    );
  }
}

class _Form extends ConsumerStatefulWidget {
  final UserProfile profile;

  const _Form({required this.profile});

  @override
  ConsumerState<_Form> createState() => _FormState();
}

class _FormState extends ConsumerState<_Form> {
  final _formKey = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.profile.name);
  late final _phone = TextEditingController(text: widget.profile.phone ?? '');
  late final _address = TextEditingController(
    text: widget.profile.residentialAddress ?? '',
  );
  bool _saving = false;

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _address.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _saving = true);
    try {
      await ref.read(userRepositoryProvider).updateMe(
        name: _name.text.trim(),
        phone: _phone.text.trim(),
        residentialAddress: _address.text.trim(),
      );
      ref.invalidate(userProfileProvider);
      // O nome também aparece no Início e no menu.
      await ref.read(authProvider.notifier).refreshProfile();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Dados guardados.')),
      );
      Navigator.pop(context);
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: AppColors.error,
          content: Text(
            e.response?.statusCode == 409
                ? 'Esse telefone já pertence a outra conta da escola.'
                : 'Não foi possível guardar. Tente de novo.',
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    InputDecoration deco(String label, IconData icon) => InputDecoration(
      labelText: label,
      prefixIcon: Icon(icon, size: 20),
    );

    return SingleChildScrollView(
      padding: getResponsiveHorizontalPadding(context).copyWith(top: 16, bottom: 40),
      child: ResponsiveConstrainedContent(
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(child: _PhotoPicker(name: widget.profile.name)),
              const SizedBox(height: 28),
              TextFormField(
                controller: _name,
                textCapitalization: TextCapitalization.words,
                decoration: deco('Nome completo', LucideIcons.user),
                validator: (v) => (v ?? '').trim().length < 2
                    ? 'Escreva o nome completo.'
                    : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                initialValue: widget.profile.email ?? '—',
                enabled: false,
                decoration: deco('E-mail (conta de entrada)', LucideIcons.mail),
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _phone,
                keyboardType: TextInputType.phone,
                decoration: deco('Telefone', LucideIcons.phone),
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _address,
                decoration: deco('Morada', LucideIcons.mapPin),
              ),
              const SizedBox(height: 12),
              Text(
                'Para mudar o e-mail de entrada, fale com a administração da escola.',
                style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
              ),
              const SizedBox(height: 28),
              SizedBox(
                height: 52,
                child: ElevatedButton(
                  onPressed: _saving ? null : _save,
                  child: _saving
                      ? SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: AppColors.onPrimary,
                          ),
                        )
                      : const Text('Guardar'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A própria fotografia, com botão para mudar ou tirar.
class _PhotoPicker extends ConsumerStatefulWidget {
  final String name;

  const _PhotoPicker({required this.name});

  @override
  ConsumerState<_PhotoPicker> createState() => _PhotoPickerState();
}

class _PhotoPickerState extends ConsumerState<_PhotoPicker> {
  bool _busy = false;

  Future<void> _run(Future<void> Function() action, String ok) async {
    setState(() => _busy = true);
    try {
      await action();
      await ref.read(authProvider.notifier).refreshProfile();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(ok)));
      }
    } on DioException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            backgroundColor: AppColors.error,
            content: Text(
              e.response?.statusCode == 400
                  ? 'Use uma imagem JPEG, PNG ou WebP até 2 MB.'
                  : 'Não foi possível guardar a fotografia.',
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _choose() async {
    final file = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      maxWidth: 800,
      maxHeight: 800,
      imageQuality: 85,
    );
    if (file == null) return;
    await _run(
      () => ref.read(userRepositoryProvider).uploadMyPhoto(file),
      'Fotografia actualizada.',
    );
  }

  @override
  Widget build(BuildContext context) {
    final key = ref.watch(authProvider)?.photoUrl;
    final base = ref.read(dioProvider).options.baseUrl;
    return Column(
      children: [
        Stack(
          children: [
            ProfilePhotoCircle(
              imageUrl: profilePhotoUrlFromKey(key, base),
              radius: 44,
              fallbackLabel: widget.name,
            ),
            Positioned(
              right: 0,
              bottom: 0,
              child: Material(
                color: AppColors.primary,
                shape: const CircleBorder(),
                child: InkWell(
                  customBorder: const CircleBorder(),
                  onTap: _busy ? null : _choose,
                  child: Padding(
                    padding: const EdgeInsets.all(8),
                    child: _busy
                        ? SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: AppColors.onPrimary,
                            ),
                          )
                        : Icon(
                            LucideIcons.camera,
                            size: 16,
                            color: AppColors.onPrimary,
                          ),
                  ),
                ),
              ),
            ),
          ],
        ),
        if (key != null && key.isNotEmpty)
          TextButton(
            onPressed: _busy
                ? null
                : () => _run(
                    () => ref.read(userRepositoryProvider).removeMyPhoto(),
                    'Fotografia removida.',
                  ),
            child: const Text('Tirar fotografia'),
          ),
      ],
    );
  }
}

/// Modo SIGA: nome e telefone gravam-se no perfil do SIGA (/api/mobile/profile,
/// com as regras do SIGA: telefone angolano e conflito se mudou noutro
/// aparelho). A escola e o e-mail vêm da conta.
class _SgaPersonalInfo extends ConsumerStatefulWidget {
  const _SgaPersonalInfo();

  @override
  ConsumerState<_SgaPersonalInfo> createState() => _SgaPersonalInfoState();
}

class _SgaPersonalInfoState extends ConsumerState<_SgaPersonalInfo> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _phone = TextEditingController();
  String? _version;
  String? _school;
  String? _loadError;
  bool _loading = true;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _loadError = null;
    });
    try {
      final p = await ref.read(sgaProfileRepositoryProvider).load();
      if (!mounted) return;
      setState(() {
        _name.text = p.fullName;
        _phone.text = p.phone ?? '';
        _version = p.updatedAt;
        _school = p.schoolName;
        _loading = false;
      });
    } on SgaRejected catch (e) {
      if (mounted) {
        setState(() {
          _loadError = e.message;
          _loading = false;
        });
      }
    }
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _saving = true);
    try {
      await ref.read(sgaProfileRepositoryProvider).save(
            fullName: _name.text.trim(),
            phone: _phone.text.trim(),
            expectedUpdatedAt: _version,
          );
      // O nome também aparece no Início e no menu.
      await ref.read(authProvider.notifier).refreshProfile();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Dados guardados.')));
      Navigator.pop(context);
    } on SgaRejected catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(backgroundColor: AppColors.error, content: Text(e.message)),
      );
      // Mudou noutro aparelho: recarregar para ter a versão actual.
      if (e.message.contains('noutro dispositivo')) _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    InputDecoration deco(String label, IconData icon) =>
        InputDecoration(labelText: label, prefixIcon: Icon(icon, size: 20));
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Dados pessoais', style: TextStyle(fontWeight: FontWeight.w600)),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _loadError != null
              ? EmptyHint(
                  icon: LucideIcons.wifiOff,
                  message: _loadError!,
                  action: TextButton(onPressed: _load, child: const Text('Tentar de novo')),
                )
              : SingleChildScrollView(
                  padding: getResponsiveHorizontalPadding(context).copyWith(top: 16, bottom: 40),
                  child: ResponsiveConstrainedContent(
                    child: Form(
                      key: _formKey,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          TextFormField(
                            controller: _name,
                            textCapitalization: TextCapitalization.words,
                            decoration: deco('Nome completo', LucideIcons.user),
                            validator: (v) =>
                                (v ?? '').trim().length < 2 ? 'Escreva o nome completo.' : null,
                          ),
                          const SizedBox(height: 16),
                          TextFormField(
                            controller: _phone,
                            keyboardType: TextInputType.phone,
                            decoration: deco('Telefone (+244 9XX XXX XXX)', LucideIcons.phone),
                          ),
                          const SizedBox(height: 16),
                          TextFormField(
                            initialValue: _school ?? '—',
                            enabled: false,
                            decoration: deco('Escola', LucideIcons.school),
                          ),
                          const SizedBox(height: 12),
                          Text(
                            'Os dados ficam no seu perfil do SIGA. A ficha de aluno ou de '
                            'encarregado da escola corrige-se na secretaria.',
                            style: TextStyle(fontSize: 12, color: AppColors.textSecondary, height: 1.4),
                          ),
                          const SizedBox(height: 28),
                          SizedBox(
                            height: 52,
                            child: ElevatedButton(
                              onPressed: _saving ? null : _save,
                              child: _saving
                                  ? SizedBox(
                                      width: 22,
                                      height: 22,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                        color: AppColors.onPrimary,
                                      ),
                                    )
                                  : const Text('Guardar'),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
    );
  }
}
