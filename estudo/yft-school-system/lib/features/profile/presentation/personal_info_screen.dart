import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/utils/responsive_utils.dart';

/// Dados da conta tal como estão no servidor (GET /api/users/me).
/// Antes, o ecrã vinha preenchido com dados inventados («John Doe») e o
/// botão «Save» mostrava sucesso sem gravar nada; a API não tem rota para
/// alterar estes dados, por isso o ecrã é só de leitura.
class PersonalInfoScreen extends ConsumerWidget {
  const PersonalInfoScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(userProfileProvider);
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text(
          'Dados pessoais',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: AppColors.secondary,
      ),
      body: profile.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                'Não foi possível carregar os dados.',
                style: TextStyle(color: AppColors.error),
              ),
              TextButton(
                onPressed: () => ref.invalidate(userProfileProvider),
                child: const Text('Tentar novamente'),
              ),
            ],
          ),
        ),
        data: (p) => SingleChildScrollView(
          padding: getResponsiveHorizontalPadding(context),
          child: ResponsiveConstrainedContent(
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 24.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Container(
                    width: 100,
                    height: 100,
                    decoration: BoxDecoration(
                      color: AppColors.primary.withValues(alpha: 0.1),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      LucideIcons.user,
                      size: 48,
                      color: AppColors.secondary,
                    ),
                  ),
                  const SizedBox(height: 32),
                  _field('Nome completo', p.name, LucideIcons.user),
                  const SizedBox(height: 20),
                  _field('E-mail', p.email, LucideIcons.mail),
                  const SizedBox(height: 20),
                  _field('Telefone', p.phone, LucideIcons.phone),
                  const SizedBox(height: 24),
                  const Text(
                    'Para corrigir estes dados, fale com a secretaria da escola.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: AppColors.textSecondary),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _field(String label, String? value, IconData icon) {
    final text = (value == null || value.trim().isEmpty) ? '—' : value.trim();
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
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.background, width: 2),
          ),
          child: Row(
            children: [
              Icon(icon, color: AppColors.primary, size: 20),
              const SizedBox(width: 16),
              Expanded(
                child: Text(
                  text,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
