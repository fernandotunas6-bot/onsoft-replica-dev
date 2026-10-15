import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/settings/academic_year_state.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/widgets/profile_photo_avatar.dart';
import 'package:yft_school_system/core/utils/currency_display.dart';
import 'package:yft_school_system/features/reports/presentation/providers/wards_provider.dart';

class PaymentHistoryScreen extends ConsumerWidget {
  const PaymentHistoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final wardsAsync = ref.watch(wardsProvider);
    final currency = ref.watch(academicYearProvider).currency;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text(
          'Propinas',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: AppColors.secondary,
      ),
      body: wardsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                LucideIcons.alertTriangle,
                size: 48,
                color: AppColors.error,
              ),
              const SizedBox(height: 16),
              Text(
                'Não foi possível carregar os saldos: $error',
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.textSecondary),
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () => ref.invalidate(wardsProvider),
                child: const Text('Tentar novamente'),
              ),
            ],
          ),
        ),
        data: (wards) {
          final totalOutstanding = wards.fold<double>(
            0,
            (sum, ward) => sum + (ward.balance < 0 ? ward.balance.abs() : 0),
          );
          final hasOutstanding = totalOutstanding > 0;

          return ListView(
            padding: const EdgeInsets.all(24),
            children: [
              Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: AppColors.secondary,
                  borderRadius: BorderRadius.circular(28),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Total em dívida',
                      style: TextStyle(color: Colors.white70, fontSize: 13),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      formatMoneyDisplay(currency, totalOutstanding),
                      style: const TextStyle(
                        color: AppColors.primary,
                        fontSize: 32,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      hasOutstanding
                          ? 'Saldos calculados com as propinas actuais das turmas dos seus educandos.'
                          : 'Os seus educandos não têm propinas em dívida.',
                      style: const TextStyle(color: Colors.white70),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              if (wards.isEmpty)
                const _EmptyState(
                  message: 'Ainda não há educandos ligados à sua conta.',
                )
              else
                ...wards.map((ward) {
                  final due = ward.balance < 0 ? ward.balance.abs() : 0.0;
                  final credit = ward.balance > 0 ? ward.balance : 0.0;
                  final statusText = due > 0
                      ? 'Em dívida'
                      : credit > 0
                          ? 'Com crédito'
                          : 'Em dia';
                  final statusColor = due > 0
                      ? AppColors.error
                      : credit > 0
                          ? Colors.blue.shade700
                          : Colors.green;

                  return Container(
                    margin: const EdgeInsets.only(bottom: 12),
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: AppColors.surface,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            WardPhotoAvatar(ward: ward, radius: 22),
                            const SizedBox(width: 16),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    ward.name,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.bold,
                                      fontSize: 16,
                                    ),
                                  ),
                                  Text(
                                    ward.className ?? 'Turma desconhecida',
                                    style: const TextStyle(
                                      color: AppColors.textSecondary,
                                      fontSize: 12,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 10,
                                vertical: 5,
                              ),
                              decoration: BoxDecoration(
                                color: statusColor.withValues(alpha: 0.1),
                                borderRadius: BorderRadius.circular(999),
                              ),
                              child: Text(
                                statusText,
                                style: TextStyle(
                                  color: statusColor,
                                  fontWeight: FontWeight.bold,
                                  fontSize: 11,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              due > 0
                                  ? 'Valor em dívida'
                                  : credit > 0
                                      ? 'Crédito'
                                      : 'Valor em dívida',
                              style: const TextStyle(
                                color: AppColors.textSecondary,
                              ),
                            ),
                            Text(
                              due > 0
                                  ? formatMoneyDisplay(currency, due)
                                  : credit > 0
                                      ? formatMoneyDisplay(currency, credit)
                                      : formatMoneyDisplay(currency, 0),
                              style: TextStyle(
                                fontWeight: FontWeight.bold,
                                color: statusColor,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            Expanded(
                              child: OutlinedButton(
                                onPressed: () =>
                                    context.push('/ward-profile', extra: ward),
                                child: const Text('Ver educando'),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: ElevatedButton(
                                onPressed: () {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                      content: Text(
                                        'O pagamento pela app ainda não está activo nesta escola.',
                                      ),
                                    ),
                                  );
                                },
                                child: const Text('Pagar'),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  );
                }),
            ],
          );
        },
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  final String message;

  const _EmptyState({required this.message});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            LucideIcons.wallet,
            size: 56,
            color: AppColors.textSecondary.withValues(alpha: 0.3),
          ),
          const SizedBox(height: 16),
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: AppColors.textSecondary,
              fontSize: 14,
            ),
          ),
        ],
      ),
    );
  }
}
