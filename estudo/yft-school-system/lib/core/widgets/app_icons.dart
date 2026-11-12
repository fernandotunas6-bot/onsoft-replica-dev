import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';

/// Ícones da navegação. "Ícones modernos" (Aparência) usa o traço fino do
/// Lucide; desligado, volta aos ícones Material arredondados.
class AppIcons {
  final bool modern;

  const AppIcons(this.modern);

  IconData get home => modern ? LucideIcons.home : Icons.home_rounded;
  IconData get subjects => modern ? LucideIcons.bookOpen : Icons.menu_book_rounded;
  IconData get calendar => modern ? LucideIcons.calendarDays : Icons.calendar_month_rounded;
  IconData get messages => modern ? LucideIcons.messageCircle : Icons.chat_bubble_outline_rounded;
  IconData get more => modern ? LucideIcons.moreHorizontal : Icons.more_horiz_rounded;
  IconData get profile => modern ? LucideIcons.user : Icons.person_outline_rounded;
  IconData get grades => modern ? LucideIcons.award : Icons.workspace_premium_outlined;
  IconData get absences => modern ? LucideIcons.clock : Icons.schedule_rounded;
  IconData get fees => modern ? LucideIcons.wallet : Icons.account_balance_wallet_outlined;
  IconData get receipts => modern ? LucideIcons.receipt : Icons.receipt_long_rounded;
  IconData get settings => modern ? LucideIcons.settings : Icons.settings_outlined;
  IconData get appearance => modern ? LucideIcons.palette : Icons.palette_outlined;
  IconData get help => modern ? LucideIcons.lifeBuoy : Icons.help_outline_rounded;
  IconData get logout => modern ? LucideIcons.logOut : Icons.logout_rounded;
  IconData get dark => modern ? LucideIcons.moon : Icons.dark_mode_outlined;
  IconData get wards => modern ? LucideIcons.baby : Icons.child_care_rounded;
  IconData get teachers => modern ? LucideIcons.users : Icons.groups_outlined;
  IconData get students => modern ? LucideIcons.graduationCap : Icons.school_outlined;
  IconData get classes => modern ? LucideIcons.layoutGrid : Icons.grid_view_rounded;
  IconData get attendance => modern ? LucideIcons.userCheck : Icons.how_to_reg_outlined;
  IconData get academicCalendar => modern ? LucideIcons.calendarRange : Icons.date_range_rounded;
  IconData get bell => modern ? LucideIcons.bell : Icons.notifications_none_rounded;
  IconData get search => modern ? LucideIcons.search : Icons.search_rounded;
  IconData get work => modern ? LucideIcons.clipboardList : Icons.assignment_outlined;
  IconData get portal => modern ? LucideIcons.externalLink : Icons.open_in_new_rounded;
}
