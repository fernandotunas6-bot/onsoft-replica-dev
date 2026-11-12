import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../theme/app_colors.dart';

/// Bloco de esqueleto: ocupa o lugar do conteúdo enquanto carrega, com um brilho
/// suave. Com «reduzir movimento» do sistema, fica parado.
class SkeletonBox extends StatelessWidget {
  final double? width;
  final double height;
  final double radius;

  const SkeletonBox({
    super.key,
    this.width,
    this.height = 14,
    this.radius = 8,
  });

  @override
  Widget build(BuildContext context) {
    final box = Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: AppColors.border,
        borderRadius: BorderRadius.circular(radius),
      ),
    );
    if (MediaQuery.maybeDisableAnimationsOf(context) ?? false) return box;
    return box
        .animate(onPlay: (controller) => controller.repeat())
        .shimmer(
          duration: 1400.ms,
          color: AppColors.surface.withValues(alpha: 0.7),
        );
  }
}

/// Cartão de esqueleto com um título e [lines] linhas, no formato dos cartões
/// do Início.
class SkeletonCard extends StatelessWidget {
  final int lines;

  const SkeletonCard({super.key, this.lines = 2});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          const SkeletonBox(width: 44, height: 44, radius: 14),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SkeletonBox(width: 120, height: 12),
                for (var i = 0; i < lines; i++) ...[
                  const SizedBox(height: 10),
                  SkeletonBox(width: i.isEven ? double.infinity : 160),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
