import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/auth/auth_state.dart';
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
  bool _obscureCurrent = true;
  bool _obscureNew = true;
  bool _obscureRepeat = true;
  final _current = TextEditingController();
  final _new = TextEditingController();
  final _repeat = TextEditingController();
  bool _changingPassword = false;

  @override
  void dispose() {
    _current.dispose();
    _new.dispose();
    _repeat.dispose();
    super.dispose();
  }

  void _say(String msg, {bool error = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg),
        backgroundColor: error ? AppColors.error : null,
      ),
    );
  }

  /// Muda a palavra-passe na conta Firebase: confirma a actual e grava a nova.
  Future<void> _changePassword() async {
    final current = _current.text;
    final next = _new.text;
    if (current.isEmpty || next.isEmpty) {
      _say('Escreva a palavra-passe actual e a nova.', error: true);
      return;
    }
    if (next.length < 8) {
      _say('A nova palavra-passe precisa de pelo menos 8 caracteres.', error: true);
      return;
    }
    if (next != _repeat.text) {
      _say('As duas novas palavras-passe não são iguais.', error: true);
      return;
    }
    if (next == current) {
      _say('A nova palavra-passe tem de ser diferente da actual.', error: true);
      return;
    }
    final user = FirebaseAuth.instance.currentUser;
    final email = user?.email;
    if (user == null || email == null) {
      _say('Sessão terminada. Entre de novo.', error: true);
      return;
    }
    setState(() => _changingPassword = true);
    try {
      await user.reauthenticateWithCredential(
        EmailAuthProvider.credential(email: email, password: current),
      );
      await user.updatePassword(next);
      if (!mounted) return;
      _current.clear();
      _new.clear();
      _repeat.clear();
      _say('Palavra-passe alterada.');
    } on FirebaseAuthException catch (e) {
      if (!mounted) return;
      _say(
        switch (e.code) {
          'wrong-password' || 'invalid-credential' => 'A palavra-passe actual não está certa.',
          'weak-password' => 'A nova palavra-passe é demasiado fraca.',
          'too-many-requests' => 'Demasiadas tentativas. Tente mais tarde.',
          'requires-recent-login' => 'Por segurança, saia e entre de novo antes de mudar.',
          _ => 'Não foi possível mudar a palavra-passe.',
        },
        error: true,
      );
    } finally {
      if (mounted) setState(() => _changingPassword = false);
    }
  }
  bool _savingAccessControl = false;

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(authProvider);
    final isAdmin = session?.role == UserRole.admin;
    final teacherCanEditResults = ref.watch(teacherCanEditResultsProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text(
          'Segurança e palavra-passe',
          style: TextStyle(fontWeight: FontWeight.w600),
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
                Text(
                  'Altere a palavra-passe e proteja a sua conta.',
                  style: TextStyle(
                    color: AppColors.textSecondary,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 32),

                _buildPasswordField(
                  _current,
                  'Palavra-passe actual',
                  'Escreva a palavra-passe actual',
                  _obscureCurrent,
                  () {
                    setState(() => _obscureCurrent = !_obscureCurrent);
                  },
                ),
                const SizedBox(height: 20),

                _buildPasswordField(
                  _new,
                  'Nova palavra-passe',
                  'Escolha a nova palavra-passe',
                  _obscureNew,
                  () {
                    setState(() => _obscureNew = !_obscureNew);
                  },
                ),
                const SizedBox(height: 20),

                _buildPasswordField(
                  _repeat,
                  'Repetir a nova palavra-passe',
                  'Confirme a nova palavra-passe',
                  _obscureRepeat,
                  () {
                    setState(() => _obscureRepeat = !_obscureRepeat);
                  },
                ),

                const SizedBox(height: 24),

                SizedBox(
                  width: double.infinity,
                  height: 56,
                  child: ElevatedButton(
                    onPressed: _changingPassword ? null : _changePassword,
                    child: _changingPassword
                        ? SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: AppColors.onPrimary,
                            ),
                          )
                        : const Text('Alterar palavra-passe'),
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
                        child: Icon(
                          LucideIcons.shieldCheck,
                          color: AppColors.secondary,
                          size: 22,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Permissões',
                            style: TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          Text(
                            'Permissões para toda a escola',
                            style: TextStyle(
                              color: AppColors.textSecondary,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
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
                            style: TextStyle(fontWeight: FontWeight.w600),
                          ),
                          subtitle: Text(
                            teacherCanEditResults
                                ? 'Os professores podem lançar e corrigir notas.'
                                : 'Os professores só vêem as notas.',
                            style: TextStyle(
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
                                            fontWeight: FontWeight.w600,
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
          style: TextStyle(
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
              icon: Icon(
                LucideIcons.lock,
                color: AppColors.primary,
                size: 20,
              ),
              border: InputBorder.none,
              enabledBorder: InputBorder.none,
              focusedBorder: InputBorder.none,
              filled: false,
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
