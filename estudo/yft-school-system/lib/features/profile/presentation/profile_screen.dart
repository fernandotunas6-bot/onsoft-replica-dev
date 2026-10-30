import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/auth/auth_state.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/widgets/app_shell.dart';
import 'package:go_router/go_router.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(authProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text(
          'Definições',
          style: TextStyle(fontWeight: FontWeight.w600),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: AppColors.secondary,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          children: [
            // Profile Header
            Center(
              child: Column(
                children: [
                  Stack(
                    children: [
                      Container(
                        width: 100,
                        height: 100,
                        decoration: BoxDecoration(
                          color: AppColors.primary.withValues(alpha: 0.1),
                          shape: BoxShape.circle,
                        ),
                        child: Icon(
                          LucideIcons.user,
                          size: 48,
                          color: AppColors.secondary,
                        ),
                      ),
                      Positioned(
                        bottom: 0,
                        right: 0,
                        child: Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: AppColors.primary,
                            shape: BoxShape.circle,
                          ),
                          child: Icon(
                            LucideIcons.camera,
                            size: 16,
                            color: AppColors.onPrimary,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Text(
                    session?.userName ?? 'Utilizador',
                    style: const TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.ink,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      roleLabel(session?.role).toUpperCase(),
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 40),

            // Settings List
            _buildSettingItem(
              icon: LucideIcons.calendar,
              title: 'Calendário académico',
              onTap: () => context.push('/academic-calendar'),
            ),
            _buildSettingItem(
              icon: LucideIcons.user,
              title: 'Dados pessoais',
              onTap: () => context.push('/personal-info'),
            ),
            _buildSettingItem(
              icon: LucideIcons.lock,
              title: 'Segurança e palavra-passe',
              onTap: () => context.push('/security-password'),
            ),
            _buildSettingItem(
              icon: LucideIcons.bell,
              title: 'Notificações',
              onTap: () => context.push('/notifications-settings'),
            ),
            _buildSettingItem(
              icon: LucideIcons.palette,
              title: 'Aparência',
              onTap: () => context.push('/aparencia'),
            ),
            _buildSettingItem(
              icon: LucideIcons.shieldCheck,
              title: 'Política de privacidade',
              onTap: () => context.push('/privacy-policy'),
            ),
            _buildSettingItem(
              icon: LucideIcons.helpCircle,
              title: 'Ajuda e apoio',
              onTap: () => context.push('/help-support'),
            ),

            const SizedBox(height: 32),

            // Logout
            ListTile(
              onTap: () async {
                await ref.read(authProvider.notifier).logout();
                if (context.mounted) context.go('/login');
              },
              leading: Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppColors.error.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(
                  LucideIcons.logOut,
                  color: AppColors.error,
                  size: 20,
                ),
              ),
              title: const Text(
                'Terminar sessão',
                style: TextStyle(
                  color: AppColors.error,
                  fontWeight: FontWeight.w600,
                ),
              ),
              trailing: const Icon(
                LucideIcons.chevronRight,
                size: 18,
                color: AppColors.error,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSettingItem({
    required IconData icon,
    required String title,
    required VoidCallback onTap,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
      ),
      child: ListTile(
        onTap: onTap,
        leading: Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: AppColors.background,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(icon, color: AppColors.secondary, size: 20),
        ),
        title: Text(
          title,
          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
        ),
        trailing: Icon(
          LucideIcons.chevronRight,
          size: 18,
          color: AppColors.textSecondary,
        ),
      ),
    );
  }
}
