import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/utils/responsive_utils.dart';
import 'package:yft_school_system/core/widgets/profile_photo_avatar.dart';
import 'providers/wards_provider.dart';

class ParentWardsScreen extends ConsumerWidget {
  const ParentWardsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final wardsAsync = ref.watch(wardsProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text(
          'My Wards',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: AppColors.secondary,
      ),
      body: wardsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, stack) => Center(child: Text('Error: $error')),
        data: (wards) {
          if (wards.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    LucideIcons.baby,
                    size: 56,
                    color: AppColors.textSecondary.withValues(alpha: 0.3),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'No wards linked to your account.',
                    style: TextStyle(
                      color: AppColors.textSecondary,
                      fontSize: 14,
                    ),
                  ),
                ],
              ),
            );
          }

          return ListView.builder(
            padding: getResponsiveHorizontalPadding(
              context,
            ).copyWith(top: 16, bottom: 32),
            itemCount: wards.length,
            itemBuilder: (context, index) {
              final ward = wards[index];
              return Card(
                margin: const EdgeInsets.only(bottom: 16),
                child: ListTile(
                  contentPadding: const EdgeInsets.all(16),
                  leading: WardPhotoAvatar(ward: ward, radius: 28),
                  title: Text(
                    ward.name,
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                  subtitle: Text(ward.className ?? 'Unknown Class'),
                  trailing: const Icon(LucideIcons.chevronRight, size: 20),
                  onTap: () {
                    context.push('/ward-profile', extra: ward);
                  },
                ),
              );
            },
          );
        },
      ),
    );
  }
}
