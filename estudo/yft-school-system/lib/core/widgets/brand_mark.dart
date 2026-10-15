import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

/// O "S" do SIGA Plus: quadrado arredondado com o gradiente da marca.
class BrandMark extends StatelessWidget {
  final double size;

  const BrandMark({super.key, this.size = 72});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        gradient: AppColors.brandGradient,
        borderRadius: BorderRadius.circular(size * 0.3),
        boxShadow: [
          BoxShadow(
            color: AppColors.brandColors[2].withValues(alpha: 0.28),
            blurRadius: size * 0.4,
            offset: Offset(0, size * 0.12),
          ),
        ],
      ),
      alignment: Alignment.center,
      child: Text(
        'S',
        style: TextStyle(
          color: Colors.white,
          fontSize: size * 0.62,
          fontWeight: FontWeight.w600,
          height: 1,
        ),
      ),
    );
  }
}

/// "SIGA Plus", com "Plus" no gradiente da marca.
class BrandWordmark extends StatelessWidget {
  final double fontSize;

  const BrandWordmark({super.key, this.fontSize = 26});

  @override
  Widget build(BuildContext context) {
    final style = TextStyle(
      fontSize: fontSize,
      fontWeight: FontWeight.w600,
      letterSpacing: -0.5,
      color: AppColors.textPrimary,
    );
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text('SIGA ', style: style),
        ShaderMask(
          blendMode: BlendMode.srcIn,
          shaderCallback: (rect) => const LinearGradient(
            colors: [Color(0xFFFF3D8B), Color(0xFF9B5CFF)],
          ).createShader(rect),
          child: Text('Plus', style: style),
        ),
      ],
    );
  }
}
