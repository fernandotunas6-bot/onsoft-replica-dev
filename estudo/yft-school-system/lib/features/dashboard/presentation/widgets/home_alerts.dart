import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../../../core/sga/sga_absences.dart';
import '../../../../core/sga/sga_config.dart';
import '../../../../core/sga/sga_work.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/section_widgets.dart';
import '../../../work/presentation/work_widgets.dart' show formatGrade;

/// Quão urgente é um alerta: decide a ordem e a cor.
enum AlertLevel { urgent, soon, info, good }

/// Uma linha de «Para ter em atenção».
class HomeAlert {
  final AlertLevel level;
  final IconData icon;
  final String title;
  final String detail;
  final String route;

  const HomeAlert({
    required this.level,
    required this.icon,
    required this.title,
    required this.detail,
    required this.route,
  });

  @override
  String toString() => 'HomeAlert($level: $title)';
}

DateTime _day(DateTime d) => DateTime(d.year, d.month, d.day);

int _daysUntil(DateTime date, DateTime now) =>
    _day(date).difference(_day(now)).inDays;

String _when(int days) => switch (days) {
  0 => 'hoje',
  1 => 'amanhã',
  _ => 'em $days dias',
};

/// O que merece atenção agora, a partir da agenda e dos trabalhos que o Início
/// já carregou (sem pedidos novos). No máximo [max], do mais urgente para o
/// menos; ao fim da tarde, o que é para amanhã sobe.
List<HomeAlert> buildHomeAlerts({
  StudentAgenda? agenda,
  WorkOverview? work,
  StudentAbsences? absences,
  required DateTime now,
  int max = 3,
}) {
  final alerts = <HomeAlert>[];
  final evening = now.hour >= 17;
  final tasks = work?.tasks ?? const <WorkTask>[];

  // Trabalhos em atraso: a primeira coisa a resolver.
  final overdue = tasks.where((t) => t.state == WorkState.overdue).toList();
  if (overdue.isNotEmpty) {
    alerts.add(
      HomeAlert(
        level: AlertLevel.urgent,
        icon: LucideIcons.alertTriangle,
        title: overdue.length == 1
            ? '«${overdue.first.title}» está em atraso'
            : '${overdue.length} trabalhos em atraso',
        detail: overdue.length == 1
            ? [
                if (overdue.first.subjectName.isNotEmpty)
                  overdue.first.subjectName,
                'ainda pode ser entregue no portal',
              ].join(' · ')
            : 'Entregar quanto antes, no portal do SIGA.',
        route: '/trabalhos',
      ),
    );
  }

  // Avaliações de hoje e amanhã.
  final assessments = [
    for (final a in agenda?.upcomingAssessments ?? const <AgendaAssessment>[])
      if (a.date != null && _daysUntil(a.date!, now) >= 0) a,
  ]..sort((a, b) => a.date!.compareTo(b.date!));
  final close = assessments
      .where((a) => _daysUntil(a.date!, now) <= 1)
      .toList();
  for (final a in close.take(2)) {
    final days = _daysUntil(a.date!, now);
    alerts.add(
      HomeAlert(
        level: days == 0 || evening ? AlertLevel.urgent : AlertLevel.soon,
        icon: LucideIcons.calendarClock,
        title:
            '${a.name}${a.subjectName.isEmpty ? '' : ' de ${a.subjectName}'} ${_when(days)}',
        detail: days == 0 ? 'Boa sorte!' : 'Rever a matéria hoje.',
        route: '/dashboard',
      ),
    );
  }

  // Trabalhos que terminam hoje ou amanhã.
  final dueSoon = [
    for (final t in tasks)
      if (t.state == WorkState.open &&
          t.dueOn != null &&
          _daysUntil(t.dueOn!, now) >= 0 &&
          _daysUntil(t.dueOn!, now) <= 1)
        t,
  ]..sort((a, b) => a.dueOn!.compareTo(b.dueOn!));
  if (dueSoon.isNotEmpty) {
    final first = dueSoon.first;
    final days = _daysUntil(first.dueOn!, now);
    alerts.add(
      HomeAlert(
        level: days == 0 || evening ? AlertLevel.urgent : AlertLevel.soon,
        icon: LucideIcons.clock,
        title: dueSoon.length == 1
            ? '«${first.title}» termina ${_when(days)}'
            : '${dueSoon.length} trabalhos terminam até amanhã',
        detail: dueSoon.length == 1 && first.subjectName.isNotEmpty
            ? first.subjectName
            : 'Ver os trabalhos por entregar.',
        route: '/trabalhos',
      ),
    );
  }

  // Avaliações no resto da semana.
  final week = assessments.where((a) {
    final d = _daysUntil(a.date!, now);
    return d > 1 && d <= 7;
  }).toList();
  if (week.isNotEmpty) {
    alerts.add(
      HomeAlert(
        level: AlertLevel.info,
        icon: LucideIcons.calendarDays,
        title: week.length == 1
            ? '${week.first.name} ${_when(_daysUntil(week.first.date!, now))}'
            : '${week.length} avaliações nos próximos dias',
        detail: {
          for (final a in week.take(3))
            if (a.subjectName.isNotEmpty) a.subjectName,
        }.join(' · '),
        route: '/dashboard',
      ),
    );
  }

  // Notas baixas nos trabalhos corrigidos.
  final low = [
    for (final t in tasks)
      if (t.state == WorkState.returned && t.grade != null && t.grade! < 10) t,
  ];
  if (low.isNotEmpty) {
    alerts.add(
      HomeAlert(
        level: AlertLevel.info,
        icon: LucideIcons.trendingDown,
        title: low.length == 1
            ? 'Nota ${formatGrade(low.first.grade!)} em «${low.first.title}»'
            : '${low.length} trabalhos com nota abaixo de 10',
        detail: 'Ler o comentário do professor e rever.',
        route: '/trabalhos',
      ),
    );
  }

  // Faltas: acima do limite é urgente (pode reprovar por faltas); perto, aviso.
  final risk = absences?.atRisk ?? const <SubjectAbsence>[];
  final over = [
    for (final s in risk)
      if (s.status == AbsenceStatus.over) s,
  ];
  final near = [
    for (final s in risk)
      if (s.status == AbsenceStatus.warning) s,
  ];
  if (over.isNotEmpty) {
    final s = over.first;
    alerts.add(
      HomeAlert(
        level: AlertLevel.urgent,
        icon: LucideIcons.userX,
        title: over.length == 1
            ? 'Faltas a ${s.subjectName} acima do limite'
            : 'Faltas acima do limite em ${over.length} disciplinas',
        detail: over.length == 1 && s.percentage != null
            ? '${formatPercent(s.percentage!)} de faltas · falar com o director de turma.'
            : over.map((s) => s.subjectName).join(' · '),
        route: '/ward-attendance',
      ),
    );
  }
  if (near.isNotEmpty) {
    final s = near.first;
    final r = s.remaining ?? 0;
    alerts.add(
      HomeAlert(
        level: AlertLevel.soon,
        icon: LucideIcons.userX,
        title: near.length == 1
            ? 'Faltas a ${s.subjectName} perto do limite'
            : 'Faltas perto do limite em ${near.length} disciplinas',
        detail: near.length == 1
            ? (r <= 0
                  ? 'Mais uma falta passa o limite.'
                  : r == 1
                  ? 'Só pode faltar a mais 1 aula.'
                  : 'Só pode faltar a mais $r aulas.')
            : near.map((s) => s.subjectName).join(' · '),
        route: '/ward-attendance',
      ),
    );
  }

  // A média do ano.
  final average = agenda?.average;
  if (average != null && average < 10) {
    alerts.add(
      HomeAlert(
        level: AlertLevel.urgent,
        icon: LucideIcons.trendingDown,
        title: 'Média do ano abaixo de 10 (${formatGrade(average)})',
        detail: 'Ver no boletim as disciplinas que a puxam para baixo.',
        route: '/result-card',
      ),
    );
  } else if (average != null && average >= 14 && alerts.isEmpty) {
    alerts.add(
      HomeAlert(
        level: AlertLevel.good,
        icon: LucideIcons.sparkles,
        title: 'Média de ${formatGrade(average)}: bom trabalho!',
        detail: 'Nada pendente para já.',
        route: '/result-card',
      ),
    );
  }

  final order = {for (final (i, l) in AlertLevel.values.indexed) l: i};
  alerts.sort((a, b) => order[a.level]!.compareTo(order[b.level]!));
  return alerts.take(max).toList();
}

Color alertColor(AlertLevel level) => switch (level) {
  AlertLevel.urgent => AppColors.error,
  AlertLevel.soon => AppColors.warning,
  AlertLevel.info => AppColors.primary,
  AlertLevel.good => AppColors.success,
};

/// «Para ter em atenção»: o mais urgente da agenda e dos trabalhos, no topo do
/// Início. Sem nada a dizer, não aparece.
class HomeAlertsCard extends ConsumerWidget {
  const HomeAlertsCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!sgaMode) return const SizedBox.shrink();
    final studentId = ref.watch(homeStudentIdProvider);
    final agenda = ref
        .watch(studentAgendaProvider(studentId))
        .whenOrNull(data: (a) => a);
    final work = ref
        .watch(workOverviewProvider(studentId))
        .whenOrNull(data: (w) => w);
    final absences = ref
        .watch(subjectAbsencesProvider(studentId))
        .whenOrNull(data: (a) => a);
    if (agenda == null && work == null && absences == null) {
      return const SizedBox.shrink();
    }
    final alerts = buildHomeAlerts(
      agenda: agenda,
      work: work,
      absences: absences,
      now: DateTime.now(),
    );
    if (alerts.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SectionHeader(title: 'Para ter em atenção'),
          SoftCard(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Column(
              children: [
                for (final (i, a) in alerts.indexed) ...[
                  if (i > 0)
                    Divider(height: 1, indent: 66, color: AppColors.border),
                  _AlertRow(alert: a),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _AlertRow extends StatelessWidget {
  final HomeAlert alert;
  const _AlertRow({required this.alert});

  @override
  Widget build(BuildContext context) {
    final color = alertColor(alert.level);
    return InkWell(
      onTap: () => context.push(alert.route),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        child: Row(
          children: [
            IconTile(icon: alert.icon, color: color, size: 40),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    alert.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textPrimary,
                    ),
                  ),
                  if (alert.detail.isNotEmpty)
                    Text(
                      alert.detail,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 12,
                        color: AppColors.textSecondary,
                      ),
                    ),
                ],
              ),
            ),
            Icon(
              Icons.chevron_right_rounded,
              size: 20,
              color: AppColors.textSecondary,
            ),
          ],
        ),
      ),
    );
  }
}
