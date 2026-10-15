import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/auth/auth_state.dart';
import 'package:yft_school_system/core/auth/password_change.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';
import 'package:yft_school_system/core/settings/access_control_state.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/utils/responsive_utils.dart';

class SecuritySettingsScreen extends ConsumerStatefulWidget {
  const SecuritySettingsScreen({super.key});

  @override
  ConsumerState<SecuritySettingsScreen> createState() =>
      _SecuritySettingsScreenState();
}

class _SecuritySettingsScreenState
    extends ConsumerState<SecuritySettingsScreen> {
  final _currentController = TextEditingController();
  final _newController = TextEditingController();
  final _repeatController = TextEditingController();
  bool _changingPassword = false;
  bool _obscureCurrent = true;
  bool _obscureNew = true;
  bool _obscureRepeat = true;
  final bool _twoFactorEnabled = false;
  bool _savingAccessControl = false;

  @override
  void dispose() {
    _currentController.dispose();
    _newController.dispose();
    _repeatController.dispose();
    super.dispose();
  }

  Future<void> _changePassword() async {
    final messenger = ScaffoldMessenger.of(context);
    void show(String text, Color color) => messenger.showSnackBar(
      SnackBar(content: Text(text), backgroundColor: color),
    );
    final current = _currentController.text;
    final next = _newController.text;
    final invalid = passwordChangeProblem(
      current,
      next,
      _repeatController.text,
    );
    if (invalid != null) return show(invalid, AppColors.error);

    setState(() => _changingPassword = true);
    final failed = await changeFirebasePassword(current, next);
    if (!mounted) return;
    setState(() => _changingPassword = false);
    if (failed != null) return show(failed, AppColors.error);

    _currentController.clear();
    _newController.clear();
    _repeatController.clear();

    // Senha temporária: o servidor confirma no Firebase e deixa de a exigir.
    final wasRequired = ref.read(authProvider)?.mustChangePassword ?? false;
    if (wasRequired) {
      try {
        await ref.read(userRepositoryProvider).confirmPasswordChanged();
        await ref.read(authProvider.notifier).refreshProfile();
      } catch (_) {
        if (!mounted) return;
        return show(
          'Senha alterada, mas o servidor ainda não a confirmou. '
          'Termine a sessão e entre com a nova senha.',
          AppColors.error,
        );
      }
    }
    if (!mounted) return;
    show('Senha alterada.', Colors.green);
    if (wasRequired) context.go('/dashboard');
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(authProvider);
    final isAdmin = session?.role == UserRole.admin;
    final teacherCanEditResults = ref.watch(teacherCanEditResultsProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text(
          'Segurança e senha',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: AppColors.secondary,
      ),
      body: SingleChildScrollView(
        padding: getResponsiveHorizontalPadding(context),
        child: ResponsiveConstrainedContent(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 24.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (session?.mustChangePassword ?? false) ...[
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.amber.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: const Text(
                      'Está a usar uma senha temporária. Escolha a sua senha '
                      'para continuar.',
                      style: TextStyle(fontWeight: FontWeight.w600),
                    ),
                  ),
                  const SizedBox(height: 16),
                ],
                const Text(
                  'Altere a senha e proteja a conta.',
                  style: TextStyle(
                    color: AppColors.textSecondary,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 32),

                _buildPasswordField(
                  _currentController,
                  'Senha actual',
                  'Senha actual',
                  _obscureCurrent,
                  () {
                    setState(() => _obscureCurrent = !_obscureCurrent);
                  },
                ),
                const SizedBox(height: 20),

                _buildPasswordField(
                  _newController,
                  'Nova senha',
                  'Nova senha',
                  _obscureNew,
                  () {
                    setState(() => _obscureNew = !_obscureNew);
                  },
                ),
                const SizedBox(height: 20),

                _buildPasswordField(
                  _repeatController,
                  'Repetir nova senha',
                  'Confirmar nova senha',
                  _obscureRepeat,
                  () {
                    setState(() => _obscureRepeat = !_obscureRepeat);
                  },
                ),

                const SizedBox(height: 40),

                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                      color: AppColors.primary.withValues(alpha: 0.3),
                    ),
                  ),
                  child: SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text(
                      'Verificação em dois passos',
                      style: TextStyle(fontWeight: FontWeight.bold),
                    ),
                    subtitle: const Text(
                      'Ainda não disponível: o servidor não suporta.',
                      style: TextStyle(
                        fontSize: 12,
                        color: AppColors.textSecondary,
                      ),
                    ),
                    activeThumbColor: AppColors.primary,
                    value: _twoFactorEnabled,
                    onChanged: null, // sem suporte no servidor
                  ),
                ),

                // Admin Access Control Section
                if (isAdmin) ...[
                  const SizedBox(height: 48),

                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: AppColors.secondary.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Icon(
                          LucideIcons.shieldCheck,
                          color: AppColors.secondary,
                          size: 22,
                        ),
                      ),
                      const SizedBox(width: 12),
                      const Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Permissões',
                            style: TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          Text(
                            'Permissões da escola',
                            style: TextStyle(
                              color: AppColors.textSecondary,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),

                  const SizedBox(height: 20),

                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: AppColors.surface,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                        color: AppColors.secondary.withValues(alpha: 0.15),
                      ),
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
                        SwitchListTile(
                          contentPadding: EdgeInsets.zero,
                          title: const Text(
                            'Professores lançam notas',
                            style: TextStyle(fontWeight: FontWeight.bold),
                          ),
                          subtitle: Text(
                            teacherCanEditResults
                                ? 'Os professores podem lançar e corrigir notas.'
                                : 'Os professores só podem consultar as notas.',
                            style: const TextStyle(
                              fontSize: 12,
                              color: AppColors.textSecondary,
                            ),
                          ),
                          secondary: Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              color: teacherCanEditResults
                                  ? Colors.green.withValues(alpha: 0.1)
                                  : AppColors.error.withValues(alpha: 0.1),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Icon(
                              teacherCanEditResults
                                  ? LucideIcons.checkCircle
                                  : LucideIcons.xCircle,
                              color: teacherCanEditResults
                                  ? Colors.green
                                  : AppColors.error,
                              size: 20,
                            ),
                          ),
                          activeThumbColor: Colors.green,
                          value: teacherCanEditResults,
                          onChanged: _savingAccessControl
                              ? null
                              : (val) async {
                                  setState(() => _savingAccessControl = true);
                                  try {
                                    await ref
                                        .read(settingsRepositoryProvider)
                                        .patchAccessControl(
                                          teacherCanEditResults: val,
                                        );
                                    await ref
                                        .read(authProvider.notifier)
                                        .refreshProfile();
                                    if (!context.mounted) return;
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      SnackBar(
                                        content: Text(
                                          val
                                              ? 'Os professores já podem lançar notas.'
                                              : 'Os professores deixaram de poder lançar notas.',
                                          style: const TextStyle(
                                            fontWeight: FontWeight.bold,
                                          ),
                                        ),
                                      ),
                                    );
                                  } catch (e) {
                                    if (!context.mounted) return;
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      SnackBar(
                                        content: Text('$e'),
                                        backgroundColor: AppColors.error,
                                      ),
                                    );
                                  } finally {
                                    if (mounted) {
                                      setState(
                                        () => _savingAccessControl = false,
                                      );
                                    }
                                  }
                                },
                        ),
                      ],
                    ),
                  ),
                ],

                const SizedBox(height: 48),

                SizedBox(
                  width: double.infinity,
                  height: 56,
                  child: ElevatedButton(
                    onPressed: _changingPassword ? null : _changePassword,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      foregroundColor: AppColors.secondary,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                    ),
                    child: const Text(
                      'Mudar senha',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
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
    );
  }

  Widget _buildPasswordField(
    TextEditingController controller,
    String label,
    String hint,
    bool isObscured,
    VoidCallback toggleVisibility,
  ) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            fontWeight: FontWeight.w600,
            fontSize: 13,
            color: AppColors.secondary,
          ),
        ),
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.background, width: 2),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.02),
                blurRadius: 10,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: TextField(
            controller: controller,
            obscureText: isObscured,
            decoration: InputDecoration(
              icon: const Icon(
                LucideIcons.lock,
                color: AppColors.primary,
                size: 20,
              ),
              border: InputBorder.none,
              hintText: hint,
              hintStyle: TextStyle(
                color: AppColors.textSecondary.withValues(alpha: 0.5),
              ),
              suffixIcon: IconButton(
                icon: Icon(
                  isObscured ? LucideIcons.eyeOff : LucideIcons.eye,
                  color: AppColors.textSecondary,
                  size: 20,
                ),
                onPressed: toggleVisibility,
              ),
            ),
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
        ),
      ],
    );
  }
}
