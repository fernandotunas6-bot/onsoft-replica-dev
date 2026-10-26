import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/utils/responsive_utils.dart';
import 'package:yft_school_system/core/widgets/section_widgets.dart';

/// Notificações: onde chegam os avisos hoje.
///
/// Os antigos interruptores (telemóvel, e-mail, SMS) não estavam ligados a
/// nada — o servidor não envia nenhum destes. Até existir envio, o ecrã diz
/// a verdade em vez de fingir guardar preferências.
class NotificationSettingsScreen extends StatelessWidget {
  const NotificationSettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    Widget channel(IconData icon, Color color, String title, String body,
        {bool available = false}) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: SoftCard(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              IconTile(icon: icon, color: color, size: 40),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            title,
                            style: TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w500,
                              color: AppColors.textPrimary,
                            ),
                          ),
                        ),
                        Text(
                          available ? 'Activo' : 'Em breve',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: available
                                ? AppColors.success
                                : AppColors.textSecondary,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      body,
                      style: TextStyle(
                        fontSize: 13,
                        height: 1.35,
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text(
          'Notificações',
          style: TextStyle(fontWeight: FontWeight.w600),
        ),
      ),
      body: SingleChildScrollView(
        padding: getResponsiveHorizontalPadding(context).copyWith(top: 8, bottom: 40),
        child: ResponsiveConstrainedContent(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Onde chegam os avisos da escola.',
                style: TextStyle(color: AppColors.textSecondary, fontSize: 13),
              ),
              const SizedBox(height: 20),
              channel(
                LucideIcons.messageCircle,
                AppColors.primary,
                'Mensagens na aplicação',
                'Comunicados, recibos de pagamento e avisos da escola. O sino '
                    'do Início mostra quantos estão por ler.',
                available: true,
              ),
              channel(
                LucideIcons.smartphone,
                AppColors.tileColors[4],
                'Notificações no telemóvel',
                'Aviso no ecrã mesmo com a aplicação fechada.',
              ),
              channel(
                LucideIcons.mail,
                AppColors.tileColors[5],
                'E-mail',
                'Resumo dos comunicados na sua caixa de correio.',
              ),
              channel(
                LucideIcons.messageSquare,
                AppColors.tileColors[3],
                'SMS',
                'Mensagem de texto para o que é urgente.',
              ),
              const SizedBox(height: 20),
              SizedBox(
                height: 52,
                child: ElevatedButton.icon(
                  onPressed: () => context.go('/mensagens'),
                  icon: const Icon(LucideIcons.messageCircle),
                  label: const Text('Abrir Mensagens'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
