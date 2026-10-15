import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';

class PrivacyPolicyScreen extends StatelessWidget {
  const PrivacyPolicyScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text(
          'Privacidade',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: AppColors.secondary,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.1),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  LucideIcons.shieldCheck,
                  size: 64,
                  color: AppColors.primary,
                ),
              ),
            ),
            const SizedBox(height: 32),
            const Text(
              'Privacidade',
              style: TextStyle(
                fontWeight: FontWeight.bold,
                fontSize: 24,
                height: 1.2,
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              'Os seus dados (nome, contactos, dados dos alunos, notas e '
              'pagamentos) são tratados pela escola que lhe deu acesso. Para '
              'saber como são usados, pedir uma cópia ou corrigi-los, fale com a '
              'secretaria da escola.\n\n'
              'Esta aplicação ainda não tem uma política de privacidade própria.',
              style: TextStyle(
                fontSize: 14,
                color: AppColors.textSecondary,
                height: 1.6,
              ),
            ),
            const SizedBox(height: 24),
            Center(
              child: TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text(
                  'Compreendi',
                  style: TextStyle(
                    color: AppColors.primary,
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
