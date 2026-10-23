import 'package:flutter/material.dart';
import 'package:yft_school_system/core/theme/lucide_icons.dart';
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
                child: const Icon(
                  LucideIcons.shieldCheck,
                  size: 64,
                  color: AppColors.primary,
                ),
              ),
            ),
            const SizedBox(height: 32),
            const Text(
              'A sua privacidade é importante',
              style: TextStyle(
                fontWeight: FontWeight.w600,
                fontSize: 24,
                height: 1.2,
              ),
            ),
            const SizedBox(height: 16),
            // Texto genérico do autor, traduzido. Não é um aviso de
            // privacidade da escola: antes de ir para produção tem de ser
            // substituído pelo aviso da própria escola, com o responsável
            // pelo tratamento, o contacto real e a base legal — e revisto por
            // quem responde juridicamente por ele.
            const Text(
              'Última actualização: 10 de Outubro de 2026\n\n'
              'A Edu Manager («nós») compromete-se a proteger os seus dados '
              'pessoais e o seu direito à privacidade. Se tiver dúvidas sobre '
              'este aviso ou sobre a forma como tratamos os seus dados, '
              'contacte-nos.',
              style: TextStyle(
                fontSize: 14,
                color: AppColors.textSecondary,
                height: 1.6,
              ),
            ),
            const SizedBox(height: 24),
            _buildSection(
              '1. Que dados recolhemos',
              'Recolhemos os dados pessoais que nos fornece ao registar-se na '
                  'aplicação, ao pedir informações da escola ou quando nos '
                  'contacta.\n\n'
                  'Os dados recolhidos dependem do contexto da sua relação '
                  'com a escola e com a administração.',
            ),
            _buildSection(
              '2. Para que usamos os seus dados',
              'Usamos os dados recolhidos na aplicação para fins académicos e '
                  'administrativos. O tratamento assenta no interesse '
                  'legítimo da administração escolar.',
            ),
            _buildSection(
              '3. Com quem partilhamos os seus dados',
              'Só partilhamos dados com o seu consentimento, para cumprir a '
                  'lei, para lhe prestar o serviço, para defender os seus '
                  'direitos ou para cumprir obrigações académicas — por '
                  'exemplo, dar a conhecer as notas ao encarregado de '
                  'educação.',
            ),
            const SizedBox(height: 24),
            Center(
              child: TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text(
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
            style: const TextStyle(
              fontWeight: FontWeight.w600,
              fontSize: 18,
              color: AppColors.secondary,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            content,
            style: const TextStyle(
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
