import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/models/teacher_summary.dart';
import 'package:yft_school_system/core/network/api_client.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/utils/media_url.dart';
import 'package:yft_school_system/core/utils/responsive_utils.dart';
import 'package:yft_school_system/core/widgets/profile_photo_avatar.dart';
import 'package:yft_school_system/core/widgets/section_widgets.dart';

/// Professores da escola, com pesquisa. Tocar abre a ficha.
class TeacherListScreen extends ConsumerStatefulWidget {
  const TeacherListScreen({super.key});

  @override
  ConsumerState<TeacherListScreen> createState() => _TeacherListScreenState();
}

class _TeacherListScreenState extends ConsumerState<TeacherListScreen> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final teachersAsync = ref.watch(teachersProvider);
    final base = ref.read(dioProvider).options.baseUrl;
    final pad = getResponsiveHorizontalPadding(context);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text(
          'Professores',
          style: TextStyle(fontWeight: FontWeight.w600),
        ),
        actions: [
          IconButton(
            tooltip: 'Registar professor',
            icon: const Icon(LucideIcons.userPlus),
            onPressed: () async {
              await context.push('/register-teacher');
              ref.invalidate(teachersProvider);
            },
          ),
        ],
      ),
      body: ResponsiveConstrainedContent(
        child: Column(
          children: [
            Padding(
              padding: EdgeInsets.fromLTRB(pad.left, 8, pad.right, 12),
              child: TextField(
                onChanged: (v) => setState(() => _query = v),
                decoration: const InputDecoration(
                  hintText: 'Pesquisar por nome, e-mail ou n.º',
                  prefixIcon: Icon(LucideIcons.search, size: 18),
                  contentPadding: EdgeInsets.symmetric(vertical: 14),
                ),
              ),
            ),
            Expanded(
              child: RefreshIndicator(
                onRefresh: () async {
                  ref.invalidate(teachersProvider);
                  await ref.read(teachersProvider.future);
                },
                child: teachersAsync.when(
                  loading: () =>
                      const Center(child: CircularProgressIndicator()),
                  error: (_, _) => ListView(
                    children: [
                      EmptyHint(
                        icon: LucideIcons.wifiOff,
                        message: 'Não foi possível carregar os professores.',
                        action: TextButton(
                          onPressed: () => ref.invalidate(teachersProvider),
                          child: const Text('Tentar de novo'),
                        ),
                      ),
                    ],
                  ),
                  data: (teachers) {
                    final q = _query.trim().toLowerCase();
                    final list = teachers
                        .where(
                          (t) =>
                              q.isEmpty ||
                              t.name.toLowerCase().contains(q) ||
                              (t.email ?? '').toLowerCase().contains(q) ||
                              (t.staffId ?? '').toLowerCase().contains(q),
                        )
                        .toList();
                    if (list.isEmpty) {
                      return ListView(
                        children: [
                          EmptyHint(
                            icon: LucideIcons.users,
                            message: teachers.isEmpty
                                ? 'Ainda não há professores registados.'
                                : 'Nenhum professor corresponde a "$_query".',
                            action: teachers.isEmpty
                                ? ElevatedButton.icon(
                                    onPressed: () =>
                                        context.push('/register-teacher'),
                                    icon: const Icon(
                                      LucideIcons.userPlus,
                                      size: 18,
                                    ),
                                    label: const Text('Registar professor'),
                                  )
                                : null,
                          ),
                        ],
                      );
                    }
                    return ListView.separated(
                      padding: EdgeInsets.fromLTRB(pad.left, 0, pad.right, 32),
                      itemCount: list.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 10),
                      itemBuilder: (context, i) =>
                          _TeacherCard(teacher: list[i], apiBase: base),
                    );
                  },
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TeacherCard extends StatelessWidget {
  final TeacherSummary teacher;
  final String apiBase;

  const _TeacherCard({required this.teacher, required this.apiBase});

  @override
  Widget build(BuildContext context) {
    final caption = [
      if (teacher.subjectsText?.isNotEmpty ?? false) teacher.subjectsText!,
      if (teacher.email?.isNotEmpty ?? false)
        teacher.email!
      else if (teacher.phone?.isNotEmpty ?? false)
        teacher.phone!,
    ].join(' · ');

    return SoftCard(
      onTap: () => context.push('/teacher-details/${teacher.uid}'),
      child: Row(
        children: [
          ProfilePhotoCircle(
            imageUrl: profilePhotoUrlFromKey(teacher.photoUrl, apiBase),
            radius: 24,
            fallbackLabel: teacher.name,
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  teacher.name,
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                    color: AppColors.textPrimary,
                  ),
                ),
                if (caption.isNotEmpty)
                  Text(
                    caption,
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
          if (teacher.staffId?.isNotEmpty ?? false)
            Text(
              teacher.staffId!,
              style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
            ),
          const SizedBox(width: 4),
          Icon(Icons.chevron_right_rounded, color: AppColors.textSecondary),
        ],
      ),
    );
  }
}
