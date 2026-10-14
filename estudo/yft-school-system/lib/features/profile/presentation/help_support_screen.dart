import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';

class HelpSupportScreen extends StatelessWidget {
  const HelpSupportScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text(
          'Ajuda e apoio',
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
            // Contact Admin Card
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: AppColors.primary,
                borderRadius: BorderRadius.circular(24),
                boxShadow: [
                  BoxShadow(
                    color: AppColors.primary.withValues(alpha: 0.3),
                    blurRadius: 20,
                    offset: const Offset(0, 10),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.2),
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: const Icon(
                          LucideIcons.headphones,
                          color: Colors.white,
                          size: 28,
                        ),
                      ),
                      const SizedBox(width: 16),
                      const Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Em que podemos ajudar?',
                              style: TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w600,
                                fontSize: 18,
                                height: 1.2,
                              ),
                            ),
                            SizedBox(height: 4),
                            Text(
                              'O apoio está disponível todos os dias.',
                              style: TextStyle(
                                color: Colors.white70,
                                fontSize: 13,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),
                  ElevatedButton(
                    onPressed: () {},
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: AppColors.primary,
                      minimumSize: const Size(double.infinity, 50),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                    ),
                    child: const Text(
                      'Contactar o apoio',
                      style: TextStyle(fontWeight: FontWeight.w600),
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 40),
            const Text(
              'Perguntas frequentes',
              style: TextStyle(fontWeight: FontWeight.w600, fontSize: 18),
            ),
            const SizedBox(height: 16),

            _buildFAQItem(
              'Como reponho a palavra-passe?',
              'Em Perfil > Segurança e palavra-passe, ou em «Esqueceu-se da palavra-passe?» no ecrã de entrada.',
            ),
            _buildFAQItem(
              'Where can I see child\'s grades?',
              'Go to the global Home or Dashboard and click on the "Wards" section to view their latest Academic Reports.',
            ),
            _buildFAQItem(
              'Como contacto um professor?',
              'Pelo endereço de e-mail que a escola disponibiliza, ou pelo portal de mensagens quando estiver disponível.',
            ),
            _buildFAQItem(
              'Porque é que as propinas não actualizam?',
              'Fee payments take up to 24 hours to clear in the school\'s accounting backend. If it still doesn\'t reflect, please use the Contact Support button.',
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFAQItem(String question, String answer) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.background, width: 2),
      ),
      child: ExpansionTile(
        title: Text(
          question,
          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
        ),
        iconColor: AppColors.primary,
        collapsedIconColor: AppColors.textSecondary,
        childrenPadding: const EdgeInsets.only(left: 16, right: 16, bottom: 16),
        children: [
          Text(
            answer,
            style: const TextStyle(
              color: AppColors.textSecondary,
              fontSize: 13,
              height: 1.5,
            ),
          ),
        ],
      ),
    );
  }
}
