import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/models/school_class.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/utils/responsive_utils.dart';
import 'package:yft_school_system/features/dashboard/presentation/providers/notices_providers.dart';

/// Publicar um comunicado (admin). Aparece em Mensagens para os
/// destinatários escolhidos.
class CreateNoticeScreen extends ConsumerStatefulWidget {
  const CreateNoticeScreen({super.key});

  @override
  ConsumerState<CreateNoticeScreen> createState() => _CreateNoticeScreenState();
}

class _CreateNoticeScreenState extends ConsumerState<CreateNoticeScreen> {
  final _formKey = GlobalKey<FormState>();
  final _titleController = TextEditingController();
  final _messageController = TextEditingController();
  String _audience = 'all';
  String _category = 'general';
  String? _classId;
  bool _sending = false;

  static const _audiences = {
    'all': 'Todos (professores e encarregados)',
    'parents': 'Só encarregados de educação',
    'teachers': 'Só professores',
    'class': 'Encarregados de uma turma',
  };

  static const _categories = {
    'general': 'Geral',
    'academic': 'Pedagógico',
    'event': 'Evento',
    'urgent': 'Urgente',
  };

  @override
  void dispose() {
    _titleController.dispose();
    _messageController.dispose();
    super.dispose();
  }

  Future<void> _publish() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _sending = true);
    try {
      await ref.read(noticesRepositoryProvider).create(
        title: _titleController.text.trim(),
        body: _messageController.text.trim(),
        audience: _audience,
        classId: _audience == 'class' ? _classId : null,
        category: _category,
      );
      ref.invalidate(parentNoticesProvider);
      ref.invalidate(unreadNoticesCountProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Comunicado publicado em Mensagens.')),
      );
      Navigator.pop(context);
    } catch (_) {
      if (!mounted) return;
      setState(() => _sending = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: AppColors.error,
          content: const Text('Não foi possível publicar. Tente de novo.'),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final classes =
        ref.watch(classesProvider).whenOrNull(data: (c) => c) ??
        const <SchoolClass>[];

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text(
          'Criar comunicado',
          style: TextStyle(fontWeight: FontWeight.w600),
        ),
      ),
      body: SingleChildScrollView(
        padding: getResponsiveHorizontalPadding(context).copyWith(
          top: 16,
          bottom: MediaQuery.of(context).padding.bottom + 40,
        ),
        child: ResponsiveConstrainedContent(
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                TextFormField(
                  controller: _titleController,
                  maxLength: 120,
                  decoration: const InputDecoration(
                    hintText: 'Título do comunicado',
                    prefixIcon: Icon(LucideIcons.type, size: 20),
                  ),
                  validator: (value) => value == null || value.trim().isEmpty
                      ? 'Escreva o título.'
                      : null,
                ),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  initialValue: _audience,
                  isExpanded: true,
                  decoration: const InputDecoration(
                    labelText: 'Para quem',
                    prefixIcon: Icon(LucideIcons.users, size: 20),
                  ),
                  items: [
                    for (final e in _audiences.entries)
                      DropdownMenuItem(value: e.key, child: Text(e.value)),
                  ],
                  onChanged: (val) => setState(() => _audience = val!),
                ),
                if (_audience == 'class') ...[
                  const SizedBox(height: 16),
                  DropdownButtonFormField<String>(
                    initialValue: _classId,
                    isExpanded: true,
                    decoration: const InputDecoration(
                      labelText: 'Turma',
                      prefixIcon: Icon(LucideIcons.layoutGrid, size: 20),
                    ),
                    items: [
                      for (final c in classes)
                        DropdownMenuItem(value: c.id, child: Text(c.className)),
                    ],
                    onChanged: (val) => setState(() => _classId = val),
                    validator: (val) => val == null ? 'Escolha a turma.' : null,
                  ),
                ],
                const SizedBox(height: 16),
                DropdownButtonFormField<String>(
                  initialValue: _category,
                  decoration: const InputDecoration(
                    labelText: 'Tipo',
                    prefixIcon: Icon(LucideIcons.tag, size: 20),
                  ),
                  items: [
                    for (final e in _categories.entries)
                      DropdownMenuItem(value: e.key, child: Text(e.value)),
                  ],
                  onChanged: (val) => setState(() => _category = val!),
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _messageController,
                  maxLines: 8,
                  maxLength: 5000,
                  decoration: const InputDecoration(
                    hintText: 'Escreva aqui a mensagem…',
                    alignLabelWithHint: true,
                  ),
                  validator: (value) => value == null || value.trim().isEmpty
                      ? 'Escreva a mensagem.'
                      : null,
                ),
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withValues(alpha: 0.06),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(LucideIcons.info, size: 16, color: AppColors.primary),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          'O comunicado aparece em Mensagens para os '
                          'destinatários. O envio por SMS ou notificação no '
                          'telemóvel ainda não está disponível.',
                          style: TextStyle(
                            fontSize: 12,
                            height: 1.4,
                            color: AppColors.textSecondary,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 28),
                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: ElevatedButton.icon(
                    icon: _sending
                        ? SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: AppColors.onPrimary,
                            ),
                          )
                        : const Icon(LucideIcons.send),
                    label: const Text('Publicar comunicado'),
                    onPressed: _sending ? null : _publish,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
