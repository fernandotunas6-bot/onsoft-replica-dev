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
          'Política de privacidade',
          style: TextStyle(fontWeight: FontWeight.w600),
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
                child: Icon(
                  LucideIcons.shieldCheck,
                  size: 64,
                  color: AppColors.primary,
                ),
              ),
            ),
            const SizedBox(height: 32),
            const Text(
              'A sua privacidade importa',
              style: TextStyle(
                fontWeight: FontWeight.w600,
                fontSize: 24,
                height: 1.2,
              ),
            ),
            const SizedBox(height: 16),
            Text(
              'Última actualização: 10 de Outubro de 2026\n\n'
              'O SIGA Plus protege os seus dados pessoais e o seu direito à privacidade. '
              'Para qualquer questão sobre esta política ou sobre os seus dados, fale com a administração da sua escola.',
              style: TextStyle(
                fontSize: 14,
                color: AppColors.textSecondary,
                height: 1.6,
              ),
            ),
            const SizedBox(height: 24),
            _buildSection(
              '1. Que dados recolhemos',
              'Os dados que a escola regista ao criar a sua conta e os que fornece ao usar a aplicação.\n\n'
                  'O que recolhemos depende da sua relação com a escola: encarregado, professor ou administração.',
            ),
            _buildSection(
              '2. Para que os usamos',
              'Para a gestão escolar: turmas, notas, presenças, propinas e comunicação entre a escola e as famílias.',
            ),
            _buildSection(
              '3. Partilhamos os seus dados?',
              'Só com o seu consentimento, por obrigação legal, ou quando a vida escolar o exige (por exemplo, mostrar as notas ao encarregado).',
            ),
            const SizedBox(height: 24),
            Center(
              child: TextButton(
                onPressed: () => Navigator.pop(context),
                child: Text(
                  'Compreendi',
                  style: TextStyle(
                    color: AppColors.primary,
                    fontWeight: FontWeight.w600,
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

  Widget _buildSection(String title, String content) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 24.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: TextStyle(
              fontWeight: FontWeight.w600,
              fontSize: 18,
              color: AppColors.secondary,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            content,
            style: TextStyle(
              fontSize: 14,
              color: AppColors.textSecondary,
              height: 1.6,
            ),
          ),
        ],
      ),
    );
  }
}
