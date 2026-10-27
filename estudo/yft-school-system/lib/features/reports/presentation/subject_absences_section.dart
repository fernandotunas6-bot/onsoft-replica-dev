import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../../core/sga/sga_absences.dart';
import '../../../core/sga/sga_config.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/section_widgets.dart';
import '../../../core/widgets/skeleton.dart';

Color absenceColor(AbsenceStatus s) => switch (s) {
  AbsenceStatus.over => AppColors.error,
  AbsenceStatus.warning => AppColors.warning,
  AbsenceStatus.ok => AppColors.success,
  AbsenceStatus.unknown => AppColors.primary,
};

/// A frase que diz o que fazer com o número.
String absenceAdvice(SubjectAbsence s) {
  final r = s.remaining;
  if (r == null) return 'A escola não definiu limite de faltas.';
  if (s.status == AbsenceStatus.over || r < 0) {
    return 'Passou o limite de faltas: falar com o director de turma.';
  }
  if (r == 0) return 'No limite: mais uma falta passa-o.';
  return r == 1
      ? 'Ainda pode faltar a 1 aula sem passar o limite.'
      : 'Ainda pode faltar a $r aulas sem passar o limite.';
}

String absenceCounts(SubjectAbsence s) {
  final parts = [
    s.absences == 1 ? '1 falta' : '${s.absences} faltas',
    s.lessons == 1 ? 'em 1 aula' : 'em ${s.lessons} aulas',
  ];
  final pct = s.percentage == null ? '' : ' · ${formatPercent(s.percentage!)}';
  final excused = s.excused > 0
      ? ' · ${s.excused} justificada${s.excused == 1 ? '' : 's'}'
      : '';
  return '${parts.join(' ')}$pct$excused';
}

/// Faltas por disciplina, da pior para a melhor, com a barra até ao limite.
class SubjectAbsencesSection extends ConsumerWidget {
  /// O aluno (null = o próprio aluno da conta).
  final String? studentId;
  const SubjectAbsencesSection({super.key, this.studentId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!sgaMode) return const SizedBox.shrink();
    final async = ref.watch(subjectAbsencesProvider(studentId));
    return async.when(
      loading: () => const Padding(
        padding: EdgeInsets.only(bottom: 24),
        child: SkeletonCard(lines: 2),
      ),
      error: (_, _) => const SizedBox.shrink(),
      data: (data) {
        if (data == null || data.subjects.isEmpty) {
          return const SizedBox.shrink();
        }
        return SubjectAbsencesList(data: data);
      },
    );
  }
}

class SubjectAbsencesList extends StatelessWidget {
  final StudentAbsences data;
  const SubjectAbsencesList({super.key, required this.data});

  @override
  Widget build(BuildContext context) {
    final limit = data.limitPercentage;
    return Padding(
      padding: const EdgeInsets.only(bottom: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SectionHeader(title: 'Por disciplina'),
          if (limit != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Text(
                'Limite da escola: ${formatPercent(limit)} de faltas em cada disciplina, '
                'contando as aulas dadas até hoje. Faltas justificadas não contam.',
                style: TextStyle(
                  fontSize: 13,
                  height: 1.35,
                  color: AppColors.textSecondary,
                ),
              ),
            ),
          for (final s in data.subjects)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _SubjectRow(subject: s, limit: limit),
            ),
        ],
      ),
    );
  }
}

class _SubjectRow extends StatelessWidget {
  final SubjectAbsence subject;
  final double? limit;
  const _SubjectRow({required this.subject, required this.limit});

  @override
  Widget build(BuildContext context) {
    final color = absenceColor(subject.status);
    final pct = subject.percentage ?? 0;
    // A barra enche até ao limite: cheia = no limite.
    final fill = limit == null || limit! <= 0
        ? (pct / 100).clamp(0.0, 1.0)
        : (pct / limit!).clamp(0.0, 1.0);
    final label = switch (subject.status) {
      AbsenceStatus.over => 'Acima do limite',
      AbsenceStatus.warning => 'Perto do limite',
      AbsenceStatus.ok => 'Dentro do limite',
      AbsenceStatus.unknown => '',
    };
    return Semantics(
      label:
          '${subject.subjectName}: ${absenceCounts(subject)}. ${absenceAdvice(subject)}',
      excludeSemantics: true,
      child: SoftCard(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    subject.subjectName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textPrimary,
                    ),
                  ),
                ),
                if (label.isNotEmpty)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 3,
                    ),
                    decoration: BoxDecoration(
                      color: color.withValues(
                        alpha: AppColors.isDark ? 0.22 : 0.12,
                      ),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      label,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textPrimary,
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: LinearProgressIndicator(
                value: fill,
                minHeight: 6,
                color: color,
                backgroundColor: AppColors.border,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              absenceCounts(subject),
              style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
            ),
            const SizedBox(height: 2),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  subject.status == AbsenceStatus.over
                      ? LucideIcons.alertTriangle
                      : LucideIcons.info,
                  size: 14,
                  color: AppColors.textSecondary,
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    absenceAdvice(subject),
                    style: TextStyle(
                      fontSize: 13,
                      color: AppColors.textPrimary,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
