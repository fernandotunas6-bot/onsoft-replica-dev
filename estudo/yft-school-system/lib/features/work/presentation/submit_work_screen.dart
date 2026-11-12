import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../../core/sga/sga_attendance.dart' show sgaPortalDioProvider;
import '../../../core/sga/sga_submission.dart';
import '../../../core/sga/sga_work.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/utils/responsive_utils.dart';
import '../../../core/widgets/section_widgets.dart';
import 'work_widgets.dart';

/// Entregar um trabalho na app: fotos das páginas (câmara ou galeria) e/ou uma
/// resposta escrita. Uma foto segue como imagem; várias juntam-se num PDF. A
/// entrega vai pela mesma função do portal, que decide prazo e atrasos.
///
/// Abre por cima da lista (`Navigator.push`) e devolve o [SubmissionResult]
/// quando a entrega é aceite.
class SubmitWorkScreen extends ConsumerStatefulWidget {
  final WorkTask task;

  /// Para os testes: em vez de abrir a câmara ou a galeria.
  final Future<List<Uint8List>> Function(ImageSource source, int remaining)?
  pickOverride;

  const SubmitWorkScreen({super.key, required this.task, this.pickOverride});

  @override
  ConsumerState<SubmitWorkScreen> createState() => _SubmitWorkScreenState();
}

class _SubmitWorkScreenState extends ConsumerState<SubmitWorkScreen> {
  final _pages = <Uint8List>[];
  final _text = TextEditingController();
  bool _sending = false;
  String? _error;

  static const _maxSide = 1600.0;
  static const _quality = 70;

  bool get _hasContent => _pages.isNotEmpty || _text.text.trim().isNotEmpty;

  @override
  void initState() {
    super.initState();
    _text.addListener(() => setState(() {}));
    _recoverLostPhotos();
  }

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  /// No Android, a câmara pode fechar a app em telemóveis com pouca memória:
  /// a foto tirada fica guardada e volta aqui.
  Future<void> _recoverLostPhotos() async {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) return;
    if (widget.pickOverride != null) return;
    try {
      final lost = await ImagePicker().retrieveLostData();
      final files = lost.files ?? const <XFile>[];
      for (final f in files) {
        if (_pages.length >= maxSubmissionPages) break;
        _pages.add(await f.readAsBytes());
      }
      if (files.isNotEmpty && mounted) setState(() {});
    } catch (_) {
      // Sem nada para recuperar.
    }
  }

  Future<List<Uint8List>> _pick(ImageSource source, int remaining) async {
    final override = widget.pickOverride;
    if (override != null) return override(source, remaining);
    final picker = ImagePicker();
    final List<XFile> files;
    if (source == ImageSource.camera || remaining < 2) {
      final one = await picker.pickImage(
        source: source,
        maxWidth: _maxSide,
        maxHeight: _maxSide,
        imageQuality: _quality,
      );
      files = one == null ? const [] : [one];
    } else {
      files = await picker.pickMultiImage(
        maxWidth: _maxSide,
        maxHeight: _maxSide,
        imageQuality: _quality,
        limit: remaining,
      );
    }
    return [for (final f in files) await f.readAsBytes()];
  }

  Future<void> _add(ImageSource source) async {
    final remaining = maxSubmissionPages - _pages.length;
    if (remaining <= 0) return;
    try {
      final picked = await _pick(source, remaining);
      if (!mounted || picked.isEmpty) return;
      setState(() {
        _pages.addAll(picked.take(remaining));
        _error = null;
      });
    } catch (_) {
      if (!mounted) return;
      setState(
        () => _error = source == ImageSource.camera
            ? 'Não foi possível abrir a câmara.'
            : 'Não foi possível abrir a galeria.',
      );
    }
  }

  Future<void> _submit() async {
    if (_sending || !_hasContent) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final attachment = await buildAttachment(
        _pages,
        title: widget.task.title,
      );
      final result = await submitWork(
        ref.read(sgaPortalDioProvider),
        taskId: widget.task.id,
        body: _text.text,
        attachment: attachment,
      );
      ref.invalidate(workOverviewProvider);
      if (mounted) Navigator.of(context).pop(result);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        _error = submissionErrorMessage(e);
      });
    }
  }

  Future<bool> _confirmLeave() async {
    final leave = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Sair sem entregar?'),
        content: const Text('As fotos e o texto desta entrega perdem-se.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Continuar'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Sair'),
          ),
        ],
      ),
    );
    return leave ?? false;
  }

  @override
  Widget build(BuildContext context) {
    final task = widget.task;
    final pad = getResponsiveHorizontalPadding(context);
    final full = _pages.length >= maxSubmissionPages;
    return PopScope(
      canPop: !_hasContent && !_sending,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop || _sending) return;
        final navigator = Navigator.of(context);
        if (await _confirmLeave()) navigator.pop();
      },
      child: Scaffold(
        appBar: AppBar(title: const Text('Entregar trabalho')),
        body: ListView(
          padding: pad.copyWith(top: 8, bottom: 24),
          children: [
            SoftCard(
              child: Row(
                children: [
                  IconTile(
                    icon: workKindIcon(task.kind),
                    color: workStateStyle(task.state).color,
                    size: 44,
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          task.title,
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                            color: AppColors.textPrimary,
                          ),
                        ),
                        Text(
                          [
                            if (task.subjectName.isNotEmpty) task.subjectName,
                            task.dueOn == null
                                ? 'sem prazo'
                                : 'prazo ${relativeDay(task.dueOn).toLowerCase()}',
                          ].join(' · '),
                          style: TextStyle(
                            fontSize: 13,
                            color: AppColors.textSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            if (task.state == WorkState.overdue)
              _Note(
                icon: LucideIcons.alarmClock,
                color: AppColors.warning,
                text:
                    'O prazo já passou: a entrega fica registada como atrasada.',
              ),
            if (task.state == WorkState.submitted)
              _Note(
                icon: LucideIcons.info,
                color: AppColors.primary,
                text:
                    'Já entregou este trabalho. Esta entrega substitui a anterior '
                    '(fica como a ${task.attempt + 1}.ª tentativa).',
              ),
            const SizedBox(height: 24),
            const SectionHeader(title: 'Fotos do trabalho'),
            Text(
              'Uma foto por página, com boa luz. Várias fotos são juntas num só PDF '
              '(até $maxSubmissionPages).',
              style: TextStyle(
                fontSize: 13,
                height: 1.35,
                color: AppColors.textSecondary,
              ),
            ),
            const SizedBox(height: 12),
            if (_pages.isNotEmpty) ...[
              _PageGrid(
                pages: _pages,
                onRemove: _sending
                    ? null
                    : (i) => setState(() => _pages.removeAt(i)),
              ),
              const SizedBox(height: 12),
            ],
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _sending || full
                        ? null
                        : () => _add(ImageSource.camera),
                    icon: const Icon(LucideIcons.camera, size: 18),
                    label: const Text('Fotografar'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _sending || full
                        ? null
                        : () => _add(ImageSource.gallery),
                    icon: const Icon(LucideIcons.imagePlus, size: 18),
                    label: const Text('Da galeria'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),
            const SectionHeader(title: 'Resposta (opcional)'),
            TextField(
              controller: _text,
              enabled: !_sending,
              minLines: 3,
              maxLines: 8,
              maxLength: 4000,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(
                hintText:
                    'Escreva aqui a resposta ou uma nota para o professor.',
              ),
            ),
            if (_error != null)
              _Note(
                icon: LucideIcons.alertCircle,
                color: AppColors.error,
                text: _error!,
              ),
          ],
        ),
        bottomNavigationBar: SafeArea(
          child: Padding(
            padding: pad.copyWith(top: 8, bottom: 12),
            child: FilledButton.icon(
              onPressed: _hasContent && !_sending ? _submit : null,
              style: FilledButton.styleFrom(
                minimumSize: const Size.fromHeight(52),
              ),
              icon: _sending
                  ? SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: AppColors.onPrimary,
                      ),
                    )
                  : const Icon(LucideIcons.send, size: 18),
              label: Text(_sending ? 'A enviar…' : 'Entregar'),
            ),
          ),
        ),
      ),
    );
  }
}

class _Note extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String text;

  const _Note({required this.icon, required this.color, required this.text});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: color.withValues(alpha: AppColors.isDark ? 0.16 : 0.08),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 18, color: color),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                text,
                style: TextStyle(
                  fontSize: 13,
                  height: 1.35,
                  color: AppColors.textPrimary,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// As páginas escolhidas, em miniatura (descodificadas pequenas, para poupar
/// memória), com o número e o botão de tirar.
class _PageGrid extends StatelessWidget {
  final List<Uint8List> pages;
  final ValueChanged<int>? onRemove;

  const _PageGrid({required this.pages, required this.onRemove});

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: pages.length,
      gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
        maxCrossAxisExtent: 120,
        mainAxisSpacing: 8,
        crossAxisSpacing: 8,
        childAspectRatio: 3 / 4,
      ),
      itemBuilder: (context, i) => Stack(
        fit: StackFit.expand,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: Image.memory(
              pages[i],
              fit: BoxFit.cover,
              cacheWidth: 240,
              gaplessPlayback: true,
              semanticLabel: 'Página ${i + 1}',
            ),
          ),
          Positioned(
            left: 6,
            bottom: 6,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
              decoration: BoxDecoration(
                color: AppColors.ink.withValues(alpha: 0.75),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                '${i + 1}',
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                ),
              ),
            ),
          ),
          if (onRemove != null)
            Positioned(
              top: 0,
              right: 0,
              child: IconButton(
                tooltip: 'Tirar a página ${i + 1}',
                onPressed: () => onRemove!(i),
                style: IconButton.styleFrom(
                  backgroundColor: AppColors.ink.withValues(alpha: 0.75),
                  foregroundColor: Colors.white,
                  minimumSize: const Size(32, 32),
                  padding: EdgeInsets.zero,
                ),
                icon: const Icon(LucideIcons.x, size: 16),
              ),
            ),
        ],
      ),
    );
  }
}
