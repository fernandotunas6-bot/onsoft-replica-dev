import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/network/api_client.dart';
import 'package:yft_school_system/core/schools/known_schools.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/utils/media_url.dart';

/// Folha "Seleccione a sua escola". Devolve a escola escolhida, ou `null`.
Future<KnownSchool?> showSchoolPicker(BuildContext context) {
  return showModalBottomSheet<KnownSchool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => const _SchoolPickerSheet(),
  );
}

class _SchoolPickerSheet extends ConsumerStatefulWidget {
  const _SchoolPickerSheet();

  @override
  ConsumerState<_SchoolPickerSheet> createState() => _SchoolPickerSheetState();
}

class _SchoolPickerSheetState extends ConsumerState<_SchoolPickerSheet> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final schools = ref.watch(knownSchoolsProvider);
    final q = _query.trim().toLowerCase();
    final filtered = q.isEmpty
        ? schools
        : schools
              .where(
                (s) =>
                    s.name.toLowerCase().contains(q) ||
                    (s.address ?? '').toLowerCase().contains(q),
              )
              .toList();
    final base = ref.read(dioProvider).options.baseUrl;

    return DraggableScrollableSheet(
      initialChildSize: 0.75,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      builder: (context, scroll) => Container(
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: ListView(
          controller: scroll,
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.textSecondary.withValues(alpha: 0.3),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 20),
            Text(
              'Seleccione a sua escola',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w600,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              onChanged: (v) => setState(() => _query = v),
              decoration: InputDecoration(
                hintText: 'Pesquisar escola…',
                prefixIcon: const Icon(LucideIcons.search, size: 18),
                fillColor: AppColors.background,
                contentPadding: const EdgeInsets.symmetric(vertical: 14),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(24),
                  borderSide: BorderSide.none,
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(24),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
            const SizedBox(height: 16),
            if (schools.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Text(
                  'Este dispositivo ainda não entrou em nenhuma escola. '
                  'Entre com a conta que a escola lhe deu e ela passa a '
                  'aparecer aqui.',
                  style: TextStyle(
                    fontSize: 13,
                    height: 1.4,
                    color: AppColors.textSecondary,
                  ),
                ),
              )
            else if (filtered.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Text(
                  'Nenhuma escola corresponde a "$_query".',
                  style: TextStyle(color: AppColors.textSecondary),
                ),
              ),
            for (final s in filtered)
              _SchoolTile(
                title: s.name,
                subtitle: s.address,
                caption: s.roleLabel,
                leading: _SchoolLogo(url: profilePhotoUrlFromKey(s.logoKey, base)),
                onTap: () => Navigator.of(context).pop(s),
              ),
            _SchoolTile(
              title: 'Sem escola por enquanto',
              subtitle: 'Solicitar vínculo',
              leading: _IconBadge(icon: LucideIcons.home),
              onTap: () {
                Navigator.of(context).pop();
                context.push('/help-support');
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _SchoolTile extends StatelessWidget {
  final String title;
  final String? subtitle;
  final String? caption;
  final Widget leading;
  final VoidCallback onTap;

  const _SchoolTile({
    required this.title,
    this.subtitle,
    this.caption,
    required this.leading,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: AppColors.border),
            ),
            child: Row(
              children: [
                leading,
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w500,
                          color: AppColors.textPrimary,
                        ),
                      ),
                      if (subtitle != null && subtitle!.isNotEmpty)
                        Text(
                          subtitle!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 13,
                            color: AppColors.textSecondary,
                          ),
                        ),
                      if (caption != null)
                        Text(
                          caption!,
                          style: TextStyle(
                            fontSize: 12,
                            color: AppColors.textSecondary,
                          ),
                        ),
                    ],
                  ),
                ),
                Icon(Icons.chevron_right_rounded, color: AppColors.textSecondary),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SchoolLogo extends StatelessWidget {
  final String? url;

  const _SchoolLogo({required this.url});

  @override
  Widget build(BuildContext context) {
    final fallback = _IconBadge(icon: LucideIcons.school);
    if (url == null) return fallback;
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: Image.network(
        url!,
        width: 48,
        height: 48,
        fit: BoxFit.contain,
        errorBuilder: (_, _, _) => fallback,
      ),
    );
  }
}

class _IconBadge extends StatelessWidget {
  final IconData icon;

  const _IconBadge({required this.icon});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 48,
      height: 48,
      decoration: BoxDecoration(
        color: AppColors.primary.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Icon(icon, color: AppColors.primary, size: 22),
    );
  }
}
