import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:yft_school_system/core/models/school_academic_calendar.dart';
import 'package:yft_school_system/core/models/school_notice.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/features/dashboard/presentation/providers/notices_providers.dart';
import 'package:yft_school_system/core/utils/term_label.dart';

enum SchoolEventKind { termStart, termEnd, notice }

/// Um acontecimento na agenda da escola.
///
/// A API ainda não tem horário de aulas nem eventos próprios: a agenda junta
/// as datas dos períodos do calendário académico e os comunicados, no dia em
/// que foram publicados.
class SchoolEvent {
  final DateTime date;
  final String title;
  final String subtitle;
  final SchoolEventKind kind;
  final SchoolNotice? notice;

  const SchoolEvent({
    required this.date,
    required this.title,
    required this.subtitle,
    required this.kind,
    this.notice,
  });

  /// Lida na hora de desenhar, para seguir a cor principal escolhida.
  Color get color => switch (kind) {
    SchoolEventKind.termStart => AppColors.success,
    SchoolEventKind.termEnd => AppColors.tileColors[3],
    SchoolEventKind.notice => AppColors.primary,
  };
}

DateTime dayOnly(DateTime d) => DateTime(d.year, d.month, d.day);

final academicCalendarProvider = FutureProvider<SchoolAcademicCalendar?>((ref) {
  return ref.read(userRepositoryProvider).getAcademicCalendar();
});

final schoolEventsProvider = FutureProvider<List<SchoolEvent>>((ref) async {
  final events = <SchoolEvent>[];

  try {
    final calendar = await ref.watch(academicCalendarProvider.future);
    for (final term in calendar?.terms ?? const <AcademicCalendarTerm>[]) {
      events.add(
        SchoolEvent(
          date: dayOnly(term.startDate),
          title: 'Início do ${termLabel(term.name)}',
          subtitle: 'Calendário académico',
          kind: SchoolEventKind.termStart,
        ),
      );
      events.add(
        SchoolEvent(
          date: dayOnly(term.endDate),
          title: 'Fim do ${termLabel(term.name)}',
          subtitle: 'Calendário académico',
          kind: SchoolEventKind.termEnd,
        ),
      );
    }
  } catch (_) {
    // Sem calendário configurado: a agenda fica só com os comunicados.
  }

  try {
    final notices = await ref.watch(parentNoticesProvider.future);
    for (final n in notices) {
      final when = DateTime.tryParse(n.createdAt);
      if (when == null) continue;
      events.add(
        SchoolEvent(
          date: dayOnly(when.toLocal()),
          title: n.title,
          subtitle: n.summary.isNotEmpty ? n.summary : 'Comunicado',
          kind: SchoolEventKind.notice,
          notice: n,
        ),
      );
    }
  } catch (_) {
    // Comunicados indisponíveis para este papel ou sem rede.
  }

  events.sort((a, b) => a.date.compareTo(b.date));
  return events;
});

const _months = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const weekdayShort = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

const weekdayLong = [
  'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira',
  'Sexta-feira', 'Sábado', 'Domingo',
];

/// "15 de Março".
String formatDayMonth(DateTime d) => '${d.day} de ${_months[d.month - 1]}';

/// "Março de 2026".
String formatMonthYear(DateTime d) => '${_months[d.month - 1]} de ${d.year}';
