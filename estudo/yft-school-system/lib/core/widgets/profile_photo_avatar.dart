import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:yft_school_system/core/models/student.dart';
import 'package:yft_school_system/core/network/api_client.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/utils/media_url.dart';

/// Full-screen viewer with pinch-zoom; close via X or Android back.
void showFullscreenNetworkImage(BuildContext context, String imageUrl) {
  showDialog<void>(
    context: context,
    barrierDismissible: true,
    barrierColor: Colors.black,
    builder: (ctx) {
      return Scaffold(
        backgroundColor: Colors.black,
        body: SafeArea(
          child: Stack(
            children: [
              Center(
                child: InteractiveViewer(
                  minScale: 0.5,
                  maxScale: 4,
                  child: Image.network(
                    imageUrl,
                    fit: BoxFit.contain,
                    loadingBuilder: (context, child, progress) {
                      if (progress == null) return child;
                      return const SizedBox(
                        width: 40,
                        height: 40,
                        child: CircularProgressIndicator(
                          color: Colors.white,
                          strokeWidth: 2,
                        ),
                      );
                    },
                    errorBuilder: (context, error, stackTrace) => const Icon(
                      Icons.broken_image_outlined,
                      color: Colors.white54,
                      size: 64,
                    ),
                  ),
                ),
              ),
              Positioned(
                top: 0,
                right: 0,
                child: IconButton(
                  icon: const Icon(Icons.close, color: Colors.white, size: 28),
                  onPressed: () => Navigator.of(ctx).pop(),
                ),
              ),
            ],
          ),
        ),
      );
    },
  );
}

/// Circular avatar from network [imageUrl]; tap opens fullscreen when URL is set.
class ProfilePhotoCircle extends StatelessWidget {
  final String? imageUrl;
  final double radius;
  final String fallbackLabel;

  const ProfilePhotoCircle({
    super.key,
    required this.imageUrl,
    required this.radius,
    required this.fallbackLabel,
  });

  @override
  Widget build(BuildContext context) {
    final url = imageUrl;
    final label =
        fallbackLabel.isNotEmpty ? fallbackLabel[0].toUpperCase() : '?';
    final fontSize = (radius * 0.45).clamp(14.0, 40.0);

    if (url == null || url.isEmpty) {
      return CircleAvatar(
        radius: radius,
        backgroundColor: AppColors.primary.withValues(alpha: 0.12),
        child: Text(
          label,
          style: TextStyle(
            fontSize: fontSize,
            fontWeight: FontWeight.bold,
            color: AppColors.secondary,
          ),
        ),
      );
    }

    return GestureDetector(
      onTap: () => showFullscreenNetworkImage(context, url),
      child: CircleAvatar(
        radius: radius,
        backgroundColor: AppColors.primary.withValues(alpha: 0.12),
        child: ClipOval(
          child: Image.network(
            url,
            width: radius * 2,
            height: radius * 2,
            fit: BoxFit.cover,
            errorBuilder: (context, error, stackTrace) => Text(
              label,
              style: TextStyle(
                fontSize: fontSize,
                fontWeight: FontWeight.bold,
                color: AppColors.secondary,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Ward/student photo using [dioProvider] base URL and [Student.photoUrl].
class WardPhotoAvatar extends ConsumerWidget {
  final Student ward;
  final double radius;

  const WardPhotoAvatar({
    super.key,
    required this.ward,
    this.radius = 24,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final base = ref.watch(dioProvider).options.baseUrl;
    final url = profilePhotoUrlFromKey(ward.photoUrl, base);
    final letter = ward.name.isNotEmpty ? ward.name[0] : '?';
    return ProfilePhotoCircle(
      imageUrl: url,
      radius: radius,
      fallbackLabel: letter,
    );
  }
}
