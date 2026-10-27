import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/models/student.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/utils/responsive_utils.dart';
import 'package:yft_school_system/core/widgets/section_widgets.dart';
import 'package:yft_school_system/features/calendar/application/school_events.dart';
import 'package:yft_school_system/features/reports/presentation/providers/wards_provider.dart';
import 'package:yft_school_system/core/sga/sga_absences.dart';
import 'package:yft_school_system/features/reports/presentation/subject_absences_section.dart';

/// Faltas do educando: presenças, faltas e as datas das faltas recentes.
class WardAttendanceScreen extends ConsumerStatefulWidget {
  final String? initialWardId;

  const WardAttendanceScreen({super.key, this.initialWardId});

  @override
  ConsumerState<WardAttendanceScreen> createState() =>
      _WardAttendanceScreenState();
}

class _WardAttendanceScreenState extends ConsumerState<WardAttendanceScreen> {
  late String? _wardId = widget.initialWardId;

  @override
  Widget build(BuildContext context) {
    final wardsAsync = ref.watch(wardsProvider);
    final pad = getResponsiveHorizontalPadding(context);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Faltas', style: TextStyle(fontWeight: FontWeight.w600)),
      ),
      body: ResponsiveConstrainedContent(
        child: wardsAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (_, _) => EmptyHint(
            icon: LucideIcons.wifiOff,
            message: 'Não foi possível carregar os educandos.',
            action: TextButton(
              onPressed: () => ref.invalidate(wardsProvider),
              child: const Text('Tentar de novo'),
            ),
          ),
          data: (wards) {
            if (wards.isEmpty) {
              return const EmptyHint(
                icon: LucideIcons.baby,
                message: 'Ainda não há educandos associados à sua conta.',
              );
            }
            final ward = wards.firstWhere(
              (w) => w.id == _wardId,
              orElse: () => wards.first,
            );
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (wards.length > 1)
                  Padding(
                    padding: EdgeInsets.fromLTRB(pad.left, 4, 0, 8),
                    child: PillTabs(
                      labels: [
                        for (final w in wards) w.name.trim().split(' ').first,
                      ],
                      selected: wards.indexOf(ward),
                      onSelected: (i) => setState(() => _wardId = wards[i].id),
                    ),
                  ),
                Expanded(child: _History(ward: ward, pad: pad)),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _History extends ConsumerWidget {
  final Student ward;
  final EdgeInsets pad;

  const _History({required this.ward, required this.pad});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(studentAttendanceProvider(ward.id));
    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(studentAttendanceProvider(ward.id));
        ref.invalidate(subjectAbsencesProvider(ward.id));
        await ref.read(studentAttendanceProvider(ward.id).future);
      },
      child: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, _) => ListView(
          children: [
            EmptyHint(
              icon: LucideIcons.wifiOff,
              message: 'Não foi possível carregar as presenças.',
              action: TextButton(
                onPressed: () =>
                    ref.invalidate(studentAttendanceProvider(ward.id)),
                child: const Text('Tentar de novo'),
              ),
            ),
          ],
        ),
        data: (h) {
          final total = h.presentDays + h.absentDays;
          if (total == 0) {
            return ListView(
              children: const [
                EmptyHint(
                  icon: LucideIcons.calendarCheck,
                  message: 'Ainda não há presenças registadas.',
                ),
              ],
            );
          }
          final rate = h.presentDays / total * 100;
          return ListView(
            padding: EdgeInsets.fromLTRB(pad.left, 8, pad.right, 32),
            children: [
              // Modo SIGA: cada disciplina face ao limite de faltas da escola.
              SubjectAbsencesSection(studentId: ward.id),
              Row(
                children: [
                  Expanded(
                    child: _Stat(
                      label: 'Presenças',
                      value: '${h.presentDays}',
                      color: AppColors.success,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _Stat(
                      label: 'Faltas',
                      value: '${h.absentDays}',
                      color: AppColors.error,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _Stat(
                      label: 'Assiduidade',
                      value: '${rate.toStringAsFixed(0)}%',
                      color: AppColors.primary,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),
              if (h.absences.isEmpty)
                Text(
                  'Sem faltas registadas.',
                  style: TextStyle(color: AppColors.textSecondary),
                )
              else ...[
                SectionHeader(title: 'Faltas recentes'),
                for (final d in h.absences)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: SoftCard(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 12,
                      ),
                      child: Row(
                        children: [
                          Icon(LucideIcons.calendarX,
                              size: 18, color: AppColors.error),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              _formatDay(d),
                              style: TextStyle(
                                fontSize: 15,
                                color: AppColors.textPrimary,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ],
          );
        },
      ),
    );
  }

  static String _formatDay(String iso) {
    final d = DateTime.tryParse(iso);
    if (d == null) return iso;
    return '${weekdayLong[d.weekday - 1]}, ${formatDayMonth(d)} de ${d.year}';
  }
}

class _Stat extends StatelessWidget {
  final String label;
  final String value;
  final Color color;

  const _Stat({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return SoftCard(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
      child: Column(
        children: [
          Text(
            value,
            style: TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w600,
              color: color,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
          ),
        ],
      ),
    );
  }
}
