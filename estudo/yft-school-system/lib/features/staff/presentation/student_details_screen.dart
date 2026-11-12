import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/auth/auth_state.dart';
import 'package:yft_school_system/core/models/student.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';
import 'package:yft_school_system/core/settings/academic_year_state.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/network/api_client.dart';
import 'package:yft_school_system/core/utils/media_url.dart';
import 'package:yft_school_system/core/utils/responsive_utils.dart';
import 'package:yft_school_system/core/utils/term_label.dart';
import 'package:yft_school_system/core/utils/currency_display.dart';

class StudentDetailsScreen extends ConsumerWidget {
  final String id;
  const StudentDetailsScreen({super.key, required this.id});

  String _formatDob(String? iso) {
    if (iso == null || iso.isEmpty) return '—';
    final parts = iso.split('-');
    if (parts.length == 3) {
      return '${parts[2]}/${parts[1]}/${parts[0]}';
    }
    return iso;
  }

  Future<void> _confirmDelete(
    BuildContext context,
    WidgetRef ref,
    Student student,
  ) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Eliminar aluno?'),
        content: Text(
          'Remove ${student.name}, as notas, o histórico de propinas e as matrículas. '
          'A conta do encarregado só é eliminada se não tiver mais educandos nesta escola.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.error),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Eliminar'),
          ),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;

    try {
      await ref.read(studentRepositoryProvider).deleteStudent(student.id);
      ref.invalidate(studentsProvider((classId: null, page: 1)));
      ref.invalidate(studentsProvider((classId: student.classId, page: 1)));
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Aluno removido')),
        );
        context.pop();
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('$e'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    }
  }

  Future<void> _setActive(
    BuildContext context,
    WidgetRef ref,
    Student student,
    bool active,
  ) async {
    try {
      await ref.read(studentRepositoryProvider).updateStudent(
            student.id,
            isActive: active,
          );
      ref.invalidate(studentByIdProvider(student.id));
      ref.invalidate(studentsProvider((classId: null, page: 1)));
      ref.invalidate(studentsProvider((classId: student.classId, page: 1)));
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(active ? 'Aluno activado' : 'Aluno desactivado'),
          ),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('$e'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(studentByIdProvider(id));
    final currency = ref.watch(academicYearProvider).currency;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: async.when(
          data: (s) => Text(s.name,
              style: const TextStyle(fontWeight: FontWeight.w600)),
          loading: () => const Text('Perfil do aluno',
              style: TextStyle(fontWeight: FontWeight.w600)),
          error: (e, s) => const Text('Perfil do aluno',
              style: TextStyle(fontWeight: FontWeight.w600)),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: AppColors.secondary,
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(LucideIcons.alertTriangle,
                    size: 48, color: AppColors.error),
                const SizedBox(height: 16),
                Text('Não foi possível carregar o aluno',
                    style: TextStyle(color: AppColors.error)),
                const SizedBox(height: 8),
                Text('$e',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                        color: AppColors.textSecondary, fontSize: 12)),
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: () =>
                      ref.invalidate(studentByIdProvider(id)),
                  child: const Text('Tentar de novo'),
                ),
              ],
            ),
          ),
        ),
        data: (student) {
          final isAdmin = ref.watch(authProvider)?.role == UserRole.admin;
          final apiBaseUrl = ref.read(dioProvider).options.baseUrl;
          return Column(
            children: [
              Expanded(
                child: SingleChildScrollView(
                  padding: getResponsiveHorizontalPadding(context)
                      .copyWith(top: 8, bottom: 16),
                  child: ResponsiveConstrainedContent(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (!student.isActive)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: Material(
                              color: AppColors.warning.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(12),
                              child: Padding(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 14, vertical: 10),
                                child: Row(
                                  children: [
                                    Icon(Icons.pause_circle_outline,
                                        color: AppColors.warning),
                                    const SizedBox(width: 10),
                                    Expanded(
                                      child: Text(
                                        'Este aluno está inactivo e não aparece na aplicação do encarregado.',
                                        style: TextStyle(
                                          color: AppColors.textPrimary,
                                          fontSize: 13,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        _StudentProfileBody(
                          student: student,
                          currency: currency,
                          formatDob: _formatDob,
                          apiBaseUrl: apiBaseUrl,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              if (isAdmin)
                SafeArea(
                  top: false,
                  child: Padding(
                    padding: getResponsiveHorizontalPadding(context)
                        .copyWith(bottom: 16, top: 8),
                    child: ResponsiveConstrainedContent(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Row(
                            children: [
                              IconButton.filledTonal(
                                onPressed: () => context
                                    .push('/admission?id=${student.id}'),
                                icon: const Icon(LucideIcons.pencil, size: 22),
                                tooltip: 'Editar',
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: OutlinedButton.icon(
                                  onPressed: () => _setActive(
                                    context,
                                    ref,
                                    student,
                                    !student.isActive,
                                  ),
                                  icon: Icon(
                                    student.isActive
                                        ? LucideIcons.userX
                                        : LucideIcons.userCheck,
                                    size: 20,
                                  ),
                                  label: Text(student.isActive
                                      ? 'Desactivar'
                                      : 'Activar'),
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: OutlinedButton.icon(
                                  style: OutlinedButton.styleFrom(
                                    foregroundColor: AppColors.error,
                                    side: const BorderSide(
                                        color: AppColors.error),
                                  ),
                                  onPressed: () =>
                                      _confirmDelete(context, ref, student),
                                  icon: const Icon(LucideIcons.trash2, size: 20),
                                  label: const Text('Eliminar'),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

class _StudentProfileBody extends StatelessWidget {
  final Student student;
  final String currency;
  final String Function(String?) formatDob;
  final String apiBaseUrl;

  const _StudentProfileBody({
    required this.student,
    required this.currency,
    required this.formatDob,
    required this.apiBaseUrl,
  });

  @override
  Widget build(BuildContext context) {
    final initials = student.name.length >= 2
        ? student.name.substring(0, 2).toUpperCase()
        : student.name.isEmpty
            ? '?'
            : student.name[0].toUpperCase();

    final photoUrl = profilePhotoUrlFromKey(student.photoUrl, apiBaseUrl);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Center(
          child: CircleAvatar(
            radius: 52,
            backgroundColor: AppColors.primary.withValues(alpha: 0.15),
            backgroundImage:
                photoUrl != null ? NetworkImage(photoUrl) : null,
            onBackgroundImageError: photoUrl != null
                ? (Object error, StackTrace? stackTrace) {}
                : null,
            child: photoUrl == null
                ? Text(
                    initials,
                    style: TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.w600,
                      color: AppColors.secondary,
                    ),
                  )
                : null,
          ),
        ),
        const SizedBox(height: 8),
        Center(
          child: Text(
            student.id,
            style: TextStyle(
              color: AppColors.textSecondary,
              fontSize: 13,
            ),
          ),
        ),
        const SizedBox(height: 24),
        _section(context, 'Aluno', [
          _row(LucideIcons.bookOpen, 'Turma',
              student.className ?? student.classId),
          _row(LucideIcons.users, 'Sexo', genderLabel(student.gender)),
          _row(LucideIcons.calendar, 'Data de nascimento', formatDob(student.dob)),
          _row(LucideIcons.school, 'Escola anterior',
              student.previousSchool ?? '—'),
          _row(LucideIcons.mapPin, 'Morada', student.address ?? '—'),
        ]),
        const SizedBox(height: 16),
        _section(context, 'Emergência', [
          _row(LucideIcons.alertCircle, 'Contacto',
              student.emergencyContactName ?? '—'),
          _row(LucideIcons.phone, 'Telefone de emergência',
              student.emergencyContactPhone ?? '—'),
        ]),
        const SizedBox(height: 16),
        _section(context, 'Saúde', [
          _row(LucideIcons.droplet, 'Grupo sanguíneo',
              student.bloodGroup ?? '—'),
          _row(LucideIcons.heartHandshake, 'Notas médicas',
              student.medicalNotes ?? '—'),
        ]),
        const SizedBox(height: 16),
        _section(context, 'Encarregado de educação', [
          _row(LucideIcons.contact, 'Nome', student.parentName ?? '—'),
          _row(LucideIcons.phone, 'Telefone', student.parentPhone ?? '—'),
          _row(LucideIcons.mail, 'E-mail', student.parentEmail ?? '—'),
        ]),
        const SizedBox(height: 16),
        _section(context, 'Propinas', [
          _row(
            LucideIcons.wallet,
            'Saldo',
            student.hasDebt
                ? '${formatMoneyDisplay(currency, student.balance.abs())} (em dívida)'
                : student.isOverpaid
                    ? '+${formatMoneyDisplay(currency, student.balance)} (a favor)'
                    : '$currency 0.00 (em dia)',
            valueColor: student.hasDebt
                ? AppColors.error
                : student.isOverpaid
                    ? AppColors.success
                    : AppColors.textPrimary,
          ),
        ]),
      ],
    );
  }

  Widget _section(BuildContext context, String title, List<Widget> rows) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
            child: Text(
              title,
              style: TextStyle(
                fontWeight: FontWeight.w600,
                fontSize: 16,
                color: AppColors.secondary,
              ),
            ),
          ),
          const Divider(height: 1),
          ...rows,
        ],
      ),
    );
  }

  Widget _row(IconData icon, String label, String value,
      {Color? valueColor}) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: AppColors.textSecondary),
          const SizedBox(width: 14),
          Expanded(
            flex: 2,
            child: Text(
              label,
              style: TextStyle(
                color: AppColors.textSecondary,
                fontSize: 14,
              ),
            ),
          ),
          Expanded(
            flex: 3,
            child: Text(
              value,
              textAlign: TextAlign.end,
              style: TextStyle(
                fontWeight: FontWeight.w600,
                fontSize: 14,
                color: valueColor ?? AppColors.textPrimary,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
