import 'package:flutter/material.dart';

class AppColors {
  // Brand Colors
  static const Color primary = Color(0xFFC7FF00); // Vibrant Lime
  /// Same family as [primary], dark enough for body text on white (receipts, PDF).
  static const Color primaryOnLight = Color(0xFF3D4F00);
  static const Color secondary = Color(0xFF1A1A1A); // Dark Grey/Black

  // Neutral Colors
  static const Color background = Color(0xFFF8F9FA);
  static const Color surface = Colors.white;
  static const Color error = Color(0xFFFF4B4B);

  // Text Colors
  static const Color textPrimary = Color(0xFF1A1A1A);
  static const Color textSecondary = Color(0xFF7C8B9A);

  // Gradients
  static const LinearGradient primaryGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [primary, Color(0xFFB5E600)],
  );
}
