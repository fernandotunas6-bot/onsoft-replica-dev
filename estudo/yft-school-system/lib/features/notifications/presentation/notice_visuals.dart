import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../../core/sga/sga_notifications.dart';
import '../../../core/theme/app_colors.dart';

/// Ícone, cor e nome curto de cada tipo de aviso.
({IconData icon, Color color, String label}) noticeVisual(NoticeKind kind) {
  final c = AppColors.tileColors;
  return switch (kind) {
    NoticeKind.work => (
      icon: LucideIcons.clipboardList,
      color: c[3],
      label: 'Trabalho',
    ),
    NoticeKind.workReturned => (
      icon: LucideIcons.clipboardCheck,
      color: c[1],
      label: 'Trabalho corrigido',
    ),
    NoticeKind.assessment => (
      icon: LucideIcons.calendarClock,
      color: c[2],
      label: 'Avaliação',
    ),
    NoticeKind.grades => (icon: LucideIcons.award, color: c[1], label: 'Notas'),
    NoticeKind.exam => (
      icon: LucideIcons.fileCheck,
      color: c[1],
      label: 'Exame',
    ),
    NoticeKind.schedule => (
      icon: LucideIcons.calendarDays,
      color: c[5],
      label: 'Horário',
    ),
    NoticeKind.lesson => (
      icon: LucideIcons.alarmClock,
      color: c[5],
      label: 'Aula',
    ),
    NoticeKind.announcement => (
      icon: LucideIcons.megaphone,
      color: c[4],
      label: 'Comunicado',
    ),
    NoticeKind.deadline => (
      icon: LucideIcons.hourglass,
      color: c[3],
      label: 'Prazo',
    ),
    NoticeKind.access => (
      icon: LucideIcons.shieldCheck,
      color: c[0],
      label: 'Acesso',
    ),
    NoticeKind.message => (
      icon: LucideIcons.messageCircle,
      color: c[0],
      label: 'Mensagem',
    ),
    NoticeKind.reminder => (
      icon: LucideIcons.bellRing,
      color: c[2],
      label: 'Lembrete',
    ),
    NoticeKind.other => (icon: LucideIcons.bell, color: c[0], label: 'Aviso'),
  };
}

const _weekdays = ['seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.', 'dom.'];

String _hm(DateTime d) =>
    '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';

DateTime _day(DateTime d) => DateTime(d.year, d.month, d.day);

/// «agora», «há 5 min», «14:20», «ontem, 14:20», «seg., 09:10», «12/10».
String noticeTime(DateTime at, {DateTime? now}) {
  final n = now ?? DateTime.now();
  final diff = n.difference(at);
  if (diff.inMinutes < 1 && !diff.isNegative) return 'agora';
  if (diff.inMinutes < 60 && !diff.isNegative) {
    return 'há ${diff.inMinutes} min';
  }
  final days = _day(n).difference(_day(at)).inDays;
  if (days == 0) return _hm(at);
  if (days == 1) return 'ontem, ${_hm(at)}';
  if (days > 1 && days < 7) return '${_weekdays[at.weekday - 1]}, ${_hm(at)}';
  return '${at.day.toString().padLeft(2, '0')}/${at.month.toString().padLeft(2, '0')}';
}

/// O grupo de um aviso na lista.
String noticeDayGroup(DateTime at, {DateTime? now}) {
  final days = _day(now ?? DateTime.now()).difference(_day(at)).inDays;
  if (days <= 0) return 'Hoje';
  if (days == 1) return 'Ontem';
  if (days < 7) return 'Esta semana';
  return 'Anteriores';
}
