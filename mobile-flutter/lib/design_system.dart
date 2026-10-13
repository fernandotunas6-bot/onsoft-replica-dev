import 'package:flutter/material.dart';

/// Institutional surfaces; the brand gradient belongs to identity.dart only.
class SigaTheme {
  static const blue = Color(0xff315ff6);
  static ThemeData build(Brightness brightness) {
    final dark = brightness == Brightness.dark;
    final surface = dark ? const Color(0xff151922) : Colors.white;
    final ink = dark ? const Color(0xffedf0f5) : const Color(0xff20242d);
    final muted = dark ? const Color(0xffa9b1bf) : const Color(0xff687180);
    final line = dark ? const Color(0xff343c49) : const Color(0xffe6e9ef);
    final base = ThemeData(useMaterial3: true, brightness: brightness);
    final scheme = ColorScheme.fromSeed(seedColor: blue, brightness: brightness).copyWith(
      surface: surface, onSurface: ink, onSurfaceVariant: muted, outlineVariant: line,
      primary: dark ? const Color(0xff9bb5ff) : blue);
    return base.copyWith(colorScheme: scheme, scaffoldBackgroundColor: surface,
      textTheme: base.textTheme.apply(bodyColor: ink, displayColor: ink).copyWith(
        headlineSmall: TextStyle(fontSize: 24, height: 1.25, fontWeight: FontWeight.w600, color: ink),
        titleLarge: TextStyle(fontSize: 20, height: 1.3, fontWeight: FontWeight.w600, color: ink),
        titleMedium: TextStyle(fontSize: 16, height: 1.4, fontWeight: FontWeight.w600, color: ink)),
      iconTheme: IconThemeData(color: ink, size: 22),
      appBarTheme: AppBarTheme(backgroundColor: surface, foregroundColor: ink,
        elevation: 0, scrolledUnderElevation: 0, surfaceTintColor: Colors.transparent,
        titleTextStyle: TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: ink)),
      inputDecorationTheme: InputDecorationTheme(filled: true,
        fillColor: dark ? const Color(0xff202632) : const Color(0xfff5f6f8),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide(color: line)),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide(color: line))),
      listTileTheme: ListTileThemeData(iconColor: ink, minVerticalPadding: 14,
        titleTextStyle: TextStyle(fontSize: 15, height: 1.35, fontWeight: FontWeight.w500, color: ink),
        subtitleTextStyle: TextStyle(fontSize: 13, height: 1.5, color: muted)),
      bottomSheetTheme: BottomSheetThemeData(backgroundColor: surface,
        surfaceTintColor: Colors.transparent, elevation: 0,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(28)))),
      filledButtonTheme: FilledButtonThemeData(style: FilledButton.styleFrom(
        minimumSize: const Size(48, 50), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)))),
      navigationBarTheme: NavigationBarThemeData(height: 72, backgroundColor: surface,
        surfaceTintColor: Colors.transparent, elevation: 0,
        indicatorColor: dark ? const Color(0xff293655) : const Color(0xffedf2ff)));
  }
}

class ServiceTile extends StatelessWidget {
  const ServiceTile({super.key, required this.icon, required this.title, required this.subtitle, required this.onTap});
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Material(
    color: Theme.of(context).brightness == Brightness.dark ? const Color(0xff202632) : const Color(0xfff5f6f8),
    borderRadius: BorderRadius.circular(20),
    child: InkWell(onTap: onTap, borderRadius: BorderRadius.circular(20),
      child: Padding(padding: const EdgeInsets.all(20), child: Column(
        crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
          Icon(icon), const SizedBox(height: 16), Text(title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 6), Text(subtitle, style: Theme.of(context).textTheme.bodySmall),
        ]))));
}

class IconWell extends StatelessWidget {
  const IconWell(this.icon, {super.key});
  final IconData icon;
  @override
  Widget build(BuildContext context) => Container(width: 46, height: 46,
    decoration: BoxDecoration(color: Theme.of(context).colorScheme.surfaceContainerLow,
      borderRadius: BorderRadius.circular(14)), child: Icon(icon));
}
