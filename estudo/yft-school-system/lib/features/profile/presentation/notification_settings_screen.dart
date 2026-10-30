import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/auth/auth_state.dart';
import 'package:yft_school_system/core/notify/notify_controller.dart';
import 'package:yft_school_system/core/notify/phone_notifications.dart';
import 'package:yft_school_system/core/realtime/live_updates.dart';
import 'package:yft_school_system/core/sga/sga_config.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/utils/responsive_utils.dart';
import 'package:yft_school_system/core/widgets/section_widgets.dart';
import 'package:yft_school_system/features/notifications/presentation/notifications_screen.dart'
    show phoneNotificationsAllowedProvider;

/// Notificações: onde chegam os avisos e o que a pessoa escolhe receber.
///
/// No telemóvel (Android), os avisos chegam com a app fechada: a app verifica
/// de meia em meia hora, entre as 6h e as 22h. Com a app aberta, chegam ao
/// segundo pelo tempo real do SIGA. E-mail e SMS ainda não são enviados — o
/// ecrã diz a verdade em vez de fingir guardar preferências.
class NotificationSettingsScreen extends ConsumerWidget {
  const NotificationSettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref
        .watch(notifyControllerProvider)
        .whenOrNull(data: (s) => s);
    final allowed =
        ref
            .watch(phoneNotificationsAllowedProvider)
            .whenOrNull(data: (a) => a) ??
        false;
    final session = ref.watch(authProvider);
    final remindersApply =
        session?.role == UserRole.parent || (session?.isStudent ?? false);
    final controller = ref.read(notifyControllerProvider.notifier);

    Widget channel(
      IconData icon,
      Color color,
      String title,
      String body, {
      String status = 'Em breve',
      bool available = false,
    }) {
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
                          status,
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

    Widget toggle({
      required IconData icon,
      required String title,
      required String subtitle,
      required bool value,
      required ValueChanged<bool>? onChanged,
    }) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: SoftCard(
          padding: const EdgeInsets.fromLTRB(16, 8, 8, 8),
          child: Row(
            children: [
              IconTile(icon: icon, color: AppColors.primary, size: 40),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w500,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: TextStyle(
                        fontSize: 13,
                        height: 1.35,
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              Switch(value: value, onChanged: onChanged),
            ],
          ),
        ),
      );
    }

    final phoneOn = (state?.phoneEnabled ?? false) && allowed;
    final realtime = ref.watch(sgaRealtimeProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text(
          'Notificações',
          style: TextStyle(fontWeight: FontWeight.w600),
        ),
      ),
      body: SingleChildScrollView(
        padding: getResponsiveHorizontalPadding(
          context,
        ).copyWith(top: 8, bottom: 40),
        child: ResponsiveConstrainedContent(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Onde chegam os avisos da escola.',
                style: TextStyle(color: AppColors.textSecondary, fontSize: 13),
              ),
              const SizedBox(height: 20),
              if (sgaMode && PhoneNotifications.supported) ...[
                toggle(
                  icon: LucideIcons.smartphone,
                  title: 'Notificações no telemóvel',
                  subtitle: phoneOn
                      ? 'Ligadas. Com a app fechada, verifica de meia em meia hora, das 6h às 22h.'
                      : (state?.phoneEnabled ?? false) && !allowed
                      ? 'O Android não deixa mostrar avisos. Toque para autorizar.'
                      : 'Desligadas: os avisos só aparecem com a app aberta.',
                  value: phoneOn,
                  onChanged: state == null
                      ? null
                      : (on) async {
                          if (on) {
                            final granted = await controller.enablePhone();
                            ref.invalidate(phoneNotificationsAllowedProvider);
                            if (!granted) {
                              await PhoneNotifications.instance.openSettings();
                            }
                          } else {
                            await controller.disablePhone();
                          }
                        },
                ),
                if (remindersApply)
                  toggle(
                    icon: LucideIcons.alarmClock,
                    title: 'Lembretes da véspera',
                    subtitle:
                        'Ao fim da tarde: avaliações e trabalhos para entregar no dia seguinte.',
                    value: state?.reminders ?? true,
                    onChanged: state == null || !phoneOn
                        ? null
                        : controller.setReminders,
                  ),
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(
                    onPressed: PhoneNotifications.instance.openSettings,
                    icon: const Icon(LucideIcons.settings, size: 16),
                    label: const Text('Som e tipos de aviso no Android'),
                  ),
                ),
                const SizedBox(height: 10),
              ],
              if (sgaMode)
                ValueListenableBuilder<bool>(
                  valueListenable: realtime.noticesLive,
                  builder: (context, live, _) => channel(
                    LucideIcons.zap,
                    AppColors.tileColors[1],
                    'Com a app aberta',
                    live
                        ? 'Os avisos chegam ao segundo, pelo tempo real do SIGA.'
                        : 'A app verifica os avisos de minuto a minuto; as mensagens e os comunicados chegam ao segundo.',
                    status: 'Activo',
                    available: true,
                  ),
                ),
              channel(
                LucideIcons.bell,
                AppColors.primary,
                'Centro de notificações',
                'Trabalhos, avaliações, notas, horário e comunicados. O sino do '
                    'Início mostra quantos estão por ler.',
                status: 'Activo',
                available: true,
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
                  onPressed: () => context.push('/notificacoes'),
                  icon: const Icon(LucideIcons.bell),
                  label: const Text('Abrir notificações'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
