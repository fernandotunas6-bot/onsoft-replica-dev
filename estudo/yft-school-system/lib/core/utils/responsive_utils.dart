import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

/// Breakpoints for responsive design (in logical pixels)
class Breakpoints {
  static const double mobile = 600;
  static const double tablet = 900;
  static const double desktop = 1200;
}

/// Returns the current screen size category
enum ScreenSize { mobile, tablet, desktop }

ScreenSize getScreenSize(BuildContext context) {
  final width = MediaQuery.of(context).size.width;
  if (width < Breakpoints.mobile) return ScreenSize.mobile;
  if (width < Breakpoints.tablet) return ScreenSize.tablet;
  return ScreenSize.desktop;
}

/// Returns true if running on web platform
bool get isWeb => kIsWeb;

/// Responsive max-width for content containers
/// Keeps content readable on wide screens
double getMaxContentWidth(BuildContext context) {
  final width = MediaQuery.of(context).size.width;
  final size = getScreenSize(context);
  switch (size) {
    case ScreenSize.mobile:
      return width; // Use full width on mobile
    case ScreenSize.tablet:
      return width * 0.90; // 90% on tablet
    case ScreenSize.desktop:
      return 1440.0; // wider max-width for modern dashboards
  }
}

/// Returns appropriate horizontal padding based on screen size
EdgeInsets getResponsiveHorizontalPadding(BuildContext context) {
  final size = getScreenSize(context);
  switch (size) {
    case ScreenSize.mobile:
      return const EdgeInsets.symmetric(horizontal: 16);
    case ScreenSize.tablet:
      return const EdgeInsets.symmetric(horizontal: 24);
    case ScreenSize.desktop:
      return const EdgeInsets.symmetric(horizontal: 32);
  }
}

/// Responsive grid column count
int getResponsiveColumnCount(BuildContext context) {
  final width = MediaQuery.of(context).size.width;
  if (width < Breakpoints.mobile) return 2;
  if (width < Breakpoints.tablet) return 3;
  if (width < Breakpoints.desktop) return 4;
  return 5;
}

/// Responsive child aspect ratio for grids
double getResponsiveChildAspectRatio(BuildContext context) {
  final width = MediaQuery.of(context).size.width;
  final count = getResponsiveColumnCount(context);
  final availableWidth = (width - 48) / count; // Account for padding
  // Keep cards roughly square but slightly taller
  return availableWidth / (availableWidth * 0.85);
}

/// A widget that centerss its child with a max-width constraint on larger screens
class ResponsiveConstrainedContent extends StatelessWidget {
  final Widget child;

  const ResponsiveConstrainedContent({required this.child, super.key});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: getMaxContentWidth(context)),
        child: child,
      ),
    );
  }
}

/// A widget that provides responsive padding
class ResponsivePadding extends StatelessWidget {
  final Widget child;

  const ResponsivePadding({required this.child, super.key});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: getResponsiveHorizontalPadding(context),
      child: child,
    );
  }
}

/// A responsive grid that adjusts columns based on screen width
class ResponsiveGrid extends StatelessWidget {
  final List<Widget> children;
  final double? childAspectRatio;
  final double mainAxisSpacing;
  final double crossAxisSpacing;

  const ResponsiveGrid({
    required this.children,
    this.childAspectRatio,
    this.mainAxisSpacing = 16,
    this.crossAxisSpacing = 16,
    super.key,
  });

  @override
  Widget build(BuildContext context) {
    final columnCount = getResponsiveColumnCount(context);
    final aspectRatio =
        childAspectRatio ?? getResponsiveChildAspectRatio(context);

    return GridView.count(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisCount: columnCount,
      childAspectRatio: aspectRatio,
      mainAxisSpacing: mainAxisSpacing,
      crossAxisSpacing: crossAxisSpacing,
      children: children,
    );
  }
}

/// Shows an adaptive bottom sheet or dialog based on platform
/// On web: shows a centered dialog
/// On mobile: shows a modal bottom sheet
Future<T?> showAdaptiveBottomSheet<T>({
  required BuildContext context,
  required WidgetBuilder builder,
  bool isScrollControlled = false,
}) async {
  if (isWeb) {
    return showDialog<T>(
      context: context,
      builder: (context) => Dialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        child: Container(
          constraints: const BoxConstraints(maxWidth: 600, maxHeight: 600),
          child: Builder(builder: builder),
        ),
      ),
    );
  } else {
    return showModalBottomSheet<T>(
      context: context,
      isScrollControlled: isScrollControlled,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.only(
          topLeft: Radius.circular(24),
          topRight: Radius.circular(24),
        ),
      ),
      builder: builder,
    );
  }
}
