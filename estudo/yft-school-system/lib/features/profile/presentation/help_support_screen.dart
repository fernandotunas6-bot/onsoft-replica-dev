import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:yft_school_system/core/auth/auth_state.dart';
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
                        child: Icon(
                          LucideIcons.headphones,
                          color: AppColors.onPrimary,
                          size: 28,
                        ),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Como podemos ajudar?',
                              style: TextStyle(
                                color: AppColors.onPrimary,
                                fontWeight: FontWeight.w600,
                                fontSize: 18,
                                height: 1.2,
                              ),
                            ),
                            SizedBox(height: 4),
                            Text(
                              'Fale com a administração da sua escola ou com o apoio SIGA Plus.',
                              style: TextStyle(
                                color: AppColors.onPrimary,
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
                    onPressed: () => _showContacts(context),
                    style: ElevatedButton.styleFrom(
                      // Invertido: as duas cores já passam AA uma sobre a outra,
                      // seja qual for a cor principal e o modo.
                      backgroundColor: AppColors.onPrimary,
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
              'Como recupero a palavra-passe?',
              'Em Definições › Segurança e palavra-passe, ou em «Esqueceu a palavra-passe?» no ecrã de entrada.',
            ),
            _buildFAQItem(
              'Onde vejo as notas do meu educando?',
              'No menu lateral, em Notas ou em Educandos.',
            ),
            _buildFAQItem(
              'Como contacto um professor?',
              'Pelos contactos que a escola divulga. Os comunicados da escola chegam a Mensagens.',
            ),
            _buildFAQItem(
              'Porque é que o pagamento ainda não aparece?',
              'O pagamento aparece quando a secretaria o regista. Se demorar, fale com a escola ou use «Contactar o apoio».',
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
            style: TextStyle(
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

/// Contactos da escola (vêm de /users/me). Sem sessão, explica onde pedir.
void _showContacts(BuildContext context) {
  final session = ProviderScope.containerOf(context).read(authProvider);
  final rows = <(IconData, String, String)>[
    if (session?.schoolPhone?.isNotEmpty ?? false)
      (Icons.phone_outlined, 'Telefone', session!.schoolPhone!),
    if (session?.schoolEmail?.isNotEmpty ?? false)
      (Icons.mail_outline, 'E-mail', session!.schoolEmail!),
    if (session?.schoolAddress?.isNotEmpty ?? false)
      (Icons.place_outlined, 'Morada', session!.schoolAddress!),
  ];
  showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (ctx) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              session?.schoolName ?? 'Contactos da escola',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w600,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 16),
            if (rows.isEmpty)
              Text(
                session == null
                    ? 'Entre na sua conta para ver os contactos da escola, '
                          'ou dirija-se à secretaria.'
                    : 'A escola ainda não registou contactos. Dirija-se à secretaria.',
                style: TextStyle(color: AppColors.textSecondary, height: 1.4),
              ),
            for (final (icon, label, value) in rows)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(icon, color: AppColors.primary),
                title: Text(label, style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                subtitle: SelectableText(
                  value,
                  style: TextStyle(fontSize: 15, color: AppColors.textPrimary),
                ),
              ),
          ],
        ),
      ),
    ),
  );
}
