import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/models/student.dart';
import 'package:yft_school_system/core/settings/academic_year_state.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/utils/responsive_utils.dart';
import 'package:yft_school_system/core/widgets/profile_photo_avatar.dart';

class WardProfileScreen extends ConsumerWidget {
  final Student? ward;

  const WardProfileScreen({super.key, this.ward});

  static Widget _actionCard({
    required IconData icon,
    required String title,
    required Color color,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(24),
      child: Container(
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(24),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.02),
              blurRadius: 10,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircleAvatar(
              backgroundColor: color.withValues(alpha: 0.1),
              radius: 28,
              child: Icon(icon, color: color, size: 28),
            ),
            const SizedBox(height: 12),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currency = ref.watch(academicYearProvider).currency;

    if (ward != null) {
      final w = ward!;
      final isCleared = w.isCleared;
      final hasDebt = w.hasDebt;
      final balanceText = hasDebt
          ? 'Em dívida: $currency ${w.balance.abs().toStringAsFixed(2)}'
          : isCleared
              ? 'Propinas em dia'
              : 'Saldo a favor: $currency ${w.balance.toStringAsFixed(2)}';
      final balanceColor = hasDebt
          ? AppColors.error
          : (isCleared ? Colors.green : Colors.blueAccent);

      final statusHint = hasDebt
          ? 'Regularize as propinas em dívida.'
          : isCleared
              ? 'Está tudo regularizado.'
              : 'Este crédito abate às próximas propinas.';

      return Scaffold(
        backgroundColor: AppColors.background,
        appBar: AppBar(
          title: const Text(
            'Educando',
            style: TextStyle(fontWeight: FontWeight.w600),
          ),
          backgroundColor: Colors.transparent,
          elevation: 0,
          foregroundColor: AppColors.secondary,
        ),
        body: SingleChildScrollView(
          padding: getResponsiveHorizontalPadding(
            context,
          ).copyWith(top: 24, bottom: 40),
          child: ResponsiveConstrainedContent(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                WardPhotoAvatar(ward: w, radius: 56),
                const SizedBox(height: 16),
                Text(
                  w.name,
                  style: const TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                Text(
                  w.className ?? 'Sem turma',
                  style: TextStyle(
                    color: AppColors.textSecondary,
                    fontSize: 16,
                  ),
                ),
                const SizedBox(height: 32),

                Container(
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(24),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.02),
                        blurRadius: 10,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(LucideIcons.wallet, color: balanceColor),
                          const SizedBox(width: 12),
                          const Expanded(
                            child: Text(
                              'Situação financeira',
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      Text(
                        balanceText,
                        style: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w600,
                          color: balanceColor,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        statusHint,
                        style: TextStyle(color: AppColors.textSecondary),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 24),

                GridView.count(
                  crossAxisCount: 2,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  mainAxisSpacing: 16,
                  crossAxisSpacing: 16,
                  childAspectRatio: 1.1,
                  children: [
                    _actionCard(
                      icon: LucideIcons.fileSpreadsheet,
                      title: 'Boletins\nescolares',
                      color: AppColors.primary,
                      onTap: () => context.push('/result-card', extra: w.id),
                    ),
                    _actionCard(
                      icon: LucideIcons.receipt,
                      title: 'Recibos de\npagamento',
                      color: Colors.teal,
                      onTap: () => context.push('/parent-receipts'),
                    ),
                    _actionCard(
                      icon: LucideIcons.calendarCheck,
                      title: 'Histórico de\npresenças',
                      color: Colors.orange,
                      onTap: () {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('A abrir as presenças…'),
                          ),
                        );
                      },
                    ),
                    _actionCard(
                      icon: LucideIcons.heartPulse,
                      title: 'Ficha\nmédica',
                      color: AppColors.error,
                      onTap: () => _showMedical(context, w),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text(
          'Educando',
          style: TextStyle(fontWeight: FontWeight.w600),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: AppColors.secondary,
      ),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              LucideIcons.user,
              size: 56,
              color: AppColors.textSecondary.withValues(alpha: 0.3),
            ),
            const SizedBox(height: 16),
            Text(
              'Perfil do educando indisponível.',
              style: TextStyle(color: AppColors.textSecondary, fontSize: 14),
            ),
          ],
        ),
      ),
    );
  }
}

/// Ficha médica: o que a escola registou na admissão.
void _showMedical(BuildContext context, Student w) {
  String v(String? s) => (s == null || s.trim().isEmpty) ? '—' : s.trim();
  Widget row(String label, String value) => Padding(
    padding: const EdgeInsets.only(bottom: 14),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
        const SizedBox(height: 2),
        Text(value, style: TextStyle(fontSize: 15, color: AppColors.textPrimary)),
      ],
    ),
  );
  showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (ctx) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Ficha médica',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600, color: AppColors.textPrimary),
            ),
            const SizedBox(height: 16),
            row('Grupo sanguíneo', v(w.bloodGroup)),
            row('Notas médicas', v(w.medicalNotes)),
            row('Contacto de emergência', v(w.emergencyContactName)),
            row('Telefone de emergência', v(w.emergencyContactPhone)),
            Text(
              'Para corrigir estes dados, fale com a secretaria da escola.',
              style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
            ),
          ],
        ),
      ),
    ),
  );
}
