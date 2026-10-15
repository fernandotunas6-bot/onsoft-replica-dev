import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:go_router/go_router.dart';
import 'package:yft_school_system/core/auth/auth_state.dart';
import 'package:yft_school_system/core/schools/known_schools.dart';
import 'package:yft_school_system/core/widgets/brand_mark.dart';
import 'package:yft_school_system/features/auth/presentation/school_picker_sheet.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/utils/responsive_utils.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _isPasswordVisible = false;
  bool _isLoading = false;
  KnownSchool? _school;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _handleLogin() async {
    final email = _emailController.text.trim();
    final password = _passwordController.text.trim();

    if (email.isEmpty || password.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Escreva o e-mail e a palavra-passe.',
            style: TextStyle(fontWeight: FontWeight.w600),
          ),
          backgroundColor: AppColors.error,
        ),
      );
      return;
    }

    setState(() => _isLoading = true);

    final error = await ref.read(authProvider.notifier).login(email, password);

    if (!mounted) return;
    setState(() => _isLoading = false);

    if (error == null) {
      final session = ref.read(authProvider);
      final picked = _school;
      if (picked != null && session != null && session.schoolId != picked.id) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Esta conta pertence a ${session.schoolName ?? 'outra escola'}; '
              'entrou nessa escola.',
            ),
          ),
        );
      }
      context.go('/dashboard');
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            error,
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
          backgroundColor: AppColors.error,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDesktop = getScreenSize(context) == ScreenSize.desktop;

    if (isDesktop) {
      return Scaffold(
        backgroundColor: AppColors.background,
        body: Row(
          children: [
            // Left branding side (Desktop only)
            Expanded(
              child: Container(
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  border: Border(
                    right: BorderSide(color: AppColors.border),
                  ),
                ),
                child: Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const BrandMark(size: 140),
                      const SizedBox(height: 40),
                      const BrandWordmark(fontSize: 40),
                      const SizedBox(height: 16),
                      Text(
                        'Educação que transforma, em qualquer lugar.',
                        style: Theme.of(
                          context,
                        ).textTheme.bodyMedium?.copyWith(fontSize: 18),
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),
                ),
              ),
            ),
            // Right login side
            Expanded(
              child: Center(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 48,
                    vertical: 24,
                  ),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 420),
                    child: _buildLoginForm(),
                  ),
                ),
              ),
            ),
          ],
        ),
      );
    }

    // Mobile/Tablet Layout
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: getResponsiveHorizontalPadding(context),
          child: ResponsiveConstrainedContent(child: _buildLoginForm()),
        ),
      ),
    );
  }

  Future<void> _pickSchool() async {
    final school = await showSchoolPicker(context);
    if (school != null && mounted) setState(() => _school = school);
  }

  Widget _buildLoginForm() {
    final textTheme = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 48),
        const Center(child: BrandWordmark(fontSize: 28)),
        const SizedBox(height: 40),
        Text(
          'Aceda à sua conta',
          style: textTheme.displayMedium?.copyWith(fontSize: 26),
        ),
        const SizedBox(height: 8),
        Text(
          'Seleccione a sua escola e utilize as suas credenciais '
          'institucionais.',
          style: textTheme.bodyMedium?.copyWith(height: 1.4),
        ),
        const SizedBox(height: 28),

        // Selector de escola: abre a folha com as escolas deste dispositivo.
        Material(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(16),
          child: InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: _pickSchool,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.border),
              ),
              child: Row(
                children: [
                  Icon(LucideIcons.school, size: 20, color: AppColors.textSecondary),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      _school?.name ?? 'Seleccione a escola',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 14,
                        color: _school == null
                            ? AppColors.textSecondary
                            : AppColors.textPrimary,
                      ),
                    ),
                  ),
                  Icon(LucideIcons.chevronDown, size: 18, color: AppColors.textSecondary),
                ],
              ),
            ),
          ),
        ),

        const SizedBox(height: 14),

        TextField(
          controller: _emailController,
          keyboardType: TextInputType.emailAddress,
          autofillHints: const [AutofillHints.email],
          decoration: const InputDecoration(
            hintText: 'E-mail da conta escolar',
            prefixIcon: Icon(LucideIcons.mail, size: 20),
          ),
        ),

        const SizedBox(height: 14),

        TextField(
          controller: _passwordController,
          obscureText: !_isPasswordVisible,
          autofillHints: const [AutofillHints.password],
          onSubmitted: (_) => _handleLogin(),
          decoration: InputDecoration(
            hintText: 'Palavra-passe',
            prefixIcon: const Icon(LucideIcons.keyRound, size: 20),
            suffixIcon: IconButton(
              icon: Icon(
                _isPasswordVisible ? LucideIcons.eyeOff : LucideIcons.eye,
                size: 20,
              ),
              onPressed: () =>
                  setState(() => _isPasswordVisible = !_isPasswordVisible),
            ),
          ),
        ),

        Align(
          alignment: Alignment.centerRight,
          child: TextButton(
            onPressed: () => context.push('/forgot-password'),
            child: Text(
              'Esqueceu a palavra-passe?',
              style: TextStyle(color: AppColors.primary),
            ),
          ),
        ),

        const SizedBox(height: 16),

        SizedBox(
          height: 56,
          child: ElevatedButton(
            onPressed: _isLoading ? null : _handleLogin,
            child: _isLoading
                ? SizedBox(
                    width: 24,
                    height: 24,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.5,
                      color: AppColors.onPrimary,
                    ),
                  )
                : const Text('Entrar', style: TextStyle(fontSize: 16)),
          ),
        ),

        const SizedBox(height: 28),

        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.primary.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(16),
          ),
          child: Row(
            children: [
              Icon(LucideIcons.info, size: 16, color: AppColors.primary),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'A sua conta é criada pela administração da escola.',
                  style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
                ),
              ),
            ],
          ),
        ),

        const SizedBox(height: 40),
      ],
    );
  }
}
