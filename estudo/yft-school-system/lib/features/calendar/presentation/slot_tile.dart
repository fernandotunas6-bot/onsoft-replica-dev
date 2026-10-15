import 'package:flutter/material.dart';
import 'package:yft_school_system/core/models/timetable_slot.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/widgets/section_widgets.dart';

/// Um tempo do horário: barra com a cor da disciplina, nome e "09:00 – 10:30
/// · Sala 3". [live] destaca a aula que está a decorrer.
class SlotTile extends StatelessWidget {
  final TimetableSlot slot;
  final bool live;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;

  const SlotTile({
    super.key,
    required this.slot,
    this.live = false,
    this.onTap,
    this.onLongPress,
  });

  @override
  Widget build(BuildContext context) {
    final color = slot.isBreak
        ? AppColors.textSecondary
        : subjectColor(slot.subjectName ?? slot.label);
    final details = [
      slot.caption,
      if (slot.teacherName != null && slot.teacherName!.isNotEmpty)
        slot.teacherName!,
    ].join(' · ');

    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        onLongPress: onLongPress,
        child: Container(
          padding: const EdgeInsets.fromLTRB(0, 14, 16, 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: live ? AppColors.primary : AppColors.border,
              width: live ? 1.5 : 1,
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 4,
                height: 40,
                margin: const EdgeInsets.only(right: 14),
                decoration: BoxDecoration(
                  color: color,
                  borderRadius: const BorderRadius.horizontal(
                    right: Radius.circular(2),
                  ),
                ),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      slot.label,
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w500,
                        color: slot.isBreak
                            ? AppColors.textSecondary
                            : AppColors.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      details,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 13,
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              if (live)
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    'Agora',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: AppColors.primary,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
