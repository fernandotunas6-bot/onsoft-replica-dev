import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/models/student.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';
import 'package:yft_school_system/core/repositories/grades_repository.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/utils/responsive_utils.dart';
import 'package:yft_school_system/core/utils/term_label.dart';
import 'package:yft_school_system/core/widgets/profile_photo_avatar.dart';
import 'package:yft_school_system/core/widgets/section_widgets.dart';
import 'package:yft_school_system/features/calendar/application/school_events.dart';
import 'package:yft_school_system/features/reports/presentation/providers/wards_provider.dart';

/// Boletim do encarregado: por educando e período, a nota de cada disciplina
/// (avaliação contínua 0–30 + exame 0–70 = 0–100) e a média.
class ResultCardScreen extends ConsumerStatefulWidget {
  /// Educando a abrir primeiro (vindo do perfil do educando).
  final String? initialWardId;

  const ResultCardScreen({super.key, this.initialWardId});

  @override
  ConsumerState<ResultCardScreen> createState() => _ResultCardScreenState();
}

class _ResultCardScreenState extends ConsumerState<ResultCardScreen> {
  late String? _wardId = widget.initialWardId;
  String? _term;

  /// Ano lectivo escolhido; null = o actual.
  String? _year;

  @override
  Widget build(BuildContext context) {
    final wardsAsync = ref.watch(wardsProvider);
    final calendar = ref.watch(academicCalendarProvider).whenOrNull(
      data: (c) => c,
    );
    final termSystem = calendar?.termSystem ?? 3;
    final terms = (calendar?.terms.isNotEmpty ?? false)
        ? [for (final t in calendar!.terms) t.name]
        : [for (var i = 1; i <= termSystem; i++) 'Term $i'];
    final term = terms.contains(_term)
        ? _term!
        : terms.contains(calendar?.activeTerm)
        ? calendar!.activeTerm
        : terms.first;
    final pad = getResponsiveHorizontalPadding(context);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text(
          'Boletins',
          style: TextStyle(fontWeight: FontWeight.w600),
        ),
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
                      onSelected: (i) => setState(() {
                        _wardId = wards[i].id;
                        _year = null;
                      }),
                    ),
                  ),
                Padding(
                  padding: EdgeInsets.fromLTRB(pad.left, 4, 0, 4),
                  child: PillTabs(
                    labels: [
                      for (final t in terms)
                        termLabel(t, termSystem: termSystem),
                    ],
                    selected: terms.indexOf(term),
                    onSelected: (i) => setState(() => _term = terms[i]),
                  ),
                ),
                // Anos anteriores só aparecem se o educando tiver notas neles.
                ...ref.watch(gradeYearsProvider(ward.id)).maybeWhen(
                  data: (y) => y.years.length < 2
                      ? const <Widget>[]
                      : [
                          Padding(
                            padding: EdgeInsets.fromLTRB(pad.left, 4, 0, 4),
                            child: PillTabs(
                              labels: y.years,
                              selected: y.years.indexOf(
                                y.years.contains(_year) ? _year! : y.current,
                              ),
                              onSelected: (i) => setState(
                                () => _year = y.years[i] == y.current ? null : y.years[i],
                              ),
                            ),
                          ),
                        ],
                  orElse: () => const <Widget>[],
                ),
                Expanded(
                  child: _ReportBody(ward: ward, term: term, year: _year, pad: pad),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _ReportBody extends ConsumerWidget {
  final Student ward;
  final String term;
  final String? year;
  final EdgeInsets pad;

  const _ReportBody({
    required this.ward,
    required this.term,
    required this.year,
    required this.pad,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final key = (studentId: ward.id, term: term, year: year);
    final reportAsync = ref.watch(reportCardProvider(key));

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(reportCardProvider(key));
        await ref.read(reportCardProvider(key).future);
      },
      child: ListView(
        padding: EdgeInsets.fromLTRB(pad.left, 12, pad.right, 32),
        children: [
          _WardHeader(ward: ward),
          const SizedBox(height: 16),
          ...reportAsync.when(
            loading: () => const [
              Padding(
                padding: EdgeInsets.all(32),
                child: Center(child: CircularProgressIndicator()),
              ),
            ],
            error: (_, _) => [
              EmptyHint(
                icon: LucideIcons.wifiOff,
                message: 'Não foi possível carregar as notas.',
                action: TextButton(
                  onPressed: () => ref.invalidate(reportCardProvider(key)),
                  child: const Text('Tentar de novo'),
                ),
              ),
            ],
            data: (card) {
              final lines = card.lines;
              final year = card.academicYear.isEmpty
                  ? null
                  : Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Text(
                        'Ano lectivo ${card.academicYear}',
                        style: TextStyle(
                          fontSize: 13,
                          color: AppColors.textSecondary,
                        ),
                      ),
                    );
              // Modo SIGA: as disciplinas vêm todas, com ou sem notas.
              final graded = [for (final l in lines) if (l.score != null) l];
              final scale = card.scale;
              if (graded.isEmpty) {
                return [
                  ?year,
                  const EmptyHint(
                    icon: LucideIcons.fileText,
                    message: 'Ainda não há notas lançadas neste período.',
                  ),
                ];
              }
              final average =
                  graded.fold<double>(0, (s, l) => s + l.score!) / graded.length;
              return [
                ?year,
                _AverageCard(average: average, count: graded.length, scale: scale),
                const SizedBox(height: 16),
                for (final l in lines)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: _SubjectLine(line: l, scale: scale),
                  ),
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(
                    scale == 20
                        ? 'Escala 0–20 (aprova com 10). MT = (MAC + NPT) ÷ 2. '
                              'As notas provisórias podem mudar até o diário fechar.'
                        : 'Avaliação contínua até 30 + exame até 70 = nota até 100.',
                    style: TextStyle(
                      fontSize: 12,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ),
              ];
            },
          ),
        ],
      ),
    );
  }
}

class _WardHeader extends StatelessWidget {
  final Student ward;

  const _WardHeader({required this.ward});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        WardPhotoAvatar(ward: ward, radius: 22),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                ward.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textPrimary,
                ),
              ),
              if (ward.className?.isNotEmpty ?? false)
                Text(
                  ward.className!,
                  style: TextStyle(
                    fontSize: 13,
                    color: AppColors.textSecondary,
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _AverageCard extends StatelessWidget {
  final double average;
  final int count;
  final int scale;

  const _AverageCard({required this.average, required this.count, this.scale = 100});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.primary,
        borderRadius: BorderRadius.circular(24),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Média do período',
                  style: TextStyle(
                    fontSize: 13,
                    color: AppColors.onPrimary.withValues(alpha: 0.85),
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  count == 1 ? '1 disciplina' : '$count disciplinas',
                  style: TextStyle(
                    fontSize: 13,
                    color: AppColors.onPrimary.withValues(alpha: 0.85),
                  ),
                ),
              ],
            ),
          ),
          Text(
            average.toStringAsFixed(1),
            style: TextStyle(
              fontSize: 34,
              fontWeight: FontWeight.w600,
              color: AppColors.onPrimary,
            ),
          ),
          Text(
            ' /$scale',
            style: TextStyle(
              fontSize: 14,
              color: AppColors.onPrimary.withValues(alpha: 0.85),
            ),
          ),
        ],
      ),
    );
  }
}

class _SubjectLine extends StatelessWidget {
  final ReportLine line;
  final int scale;

  const _SubjectLine({required this.line, this.scale = 100});

  String _fmt(double v) =>
      v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(1);

  String _opt(double? v) => v == null ? '—' : _fmt(v);

  @override
  Widget build(BuildContext context) {
    final color = subjectColor(line.subjectName);
    return SoftCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              IconTile(
                icon: subjectIcon(line.subjectName),
                color: color,
                size: 40,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      line.subjectName,
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w500,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    Text(
                      line.angola == null
                          ? 'Contínua ${_fmt(line.classScore)} · Exame ${_fmt(line.examScore)}'
                          : 'MAC ${_opt(line.angola!.mac)} · NPP ${_opt(line.angola!.npp)} · '
                                'NPT ${_opt(line.angola!.npt)}'
                                '${line.angola!.provisional ? ' · provisória' : ''}',
                      style: TextStyle(
                        fontSize: 12,
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              Text(
                _opt(line.score),
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w600,
                  // Escala angolana: abaixo de 10 não aprova.
                  color: scale == 20 && (line.score ?? 10) < 10
                      ? AppColors.error
                      : AppColors.textPrimary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(3),
            child: LinearProgressIndicator(
              value: ((line.score ?? 0) / scale).clamp(0, 1),
              minHeight: 6,
              color: color,
              backgroundColor: color.withValues(alpha: 0.12),
            ),
          ),
        ],
      ),
    );
  }
}
