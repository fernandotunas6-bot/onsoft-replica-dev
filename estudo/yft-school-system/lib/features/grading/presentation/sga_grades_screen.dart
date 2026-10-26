import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:yft_school_system/core/sga/sga_attendance.dart'
    show SgaRejected;
import 'package:yft_school_system/core/sga/sga_config.dart';
import 'package:yft_school_system/core/sga/sga_grades.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:yft_school_system/core/utils/responsive_utils.dart';
import 'package:yft_school_system/core/widgets/profile_photo_avatar.dart';
import 'package:yft_school_system/core/widgets/section_widgets.dart';

final _assignmentsProvider = FutureProvider.autoDispose<List<SgaAssignment>>(
  (ref) => ref.read(sgaGradesRepositoryProvider).assignments(),
);

final _sheetProvider = FutureProvider.autoDispose
    .family<SgaGradeSheet, (SgaAssignment, int)>(
      (ref, k) => ref.read(sgaGradesRepositoryProvider).sheet(k.$1, k.$2),
    );

/// Modo SIGA: lançar MAC/NPP/NPT de uma turma numa disciplina, por trimestre.
/// Grava só os alunos alterados, com as três notas (o SIGA pede as três).
class SgaGradesScreen extends ConsumerStatefulWidget {
  const SgaGradesScreen({super.key});

  @override
  ConsumerState<SgaGradesScreen> createState() => _SgaGradesScreenState();
}

class _SgaGradesScreenState extends ConsumerState<SgaGradesScreen> {
  String? _assignmentKey;
  int _term = 1;

  /// enrollmentId → [MAC, NPP, NPT] escritos neste ecrã (texto).
  final Map<String, List<String?>> _edits = {};
  bool _saving = false;

  static double? _parse(String? v) {
    final t = (v ?? '').trim().replaceAll(',', '.');
    if (t.isEmpty) return null;
    return double.tryParse(t);
  }

  static String _fmt(double? v) => v == null
      ? ''
      : (v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(1));

  bool _confirmDiscard() => _edits.isEmpty;

  Future<bool> _askDiscard() async {
    if (_confirmDiscard()) return true;
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Descartar alterações?'),
        content: const Text('Há notas escritas que ainda não foram gravadas.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Continuar a editar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Descartar'),
          ),
        ],
      ),
    );
    return ok ?? false;
  }

  Future<void> _save(SgaAssignment a, SgaGradeSheet sheet) async {
    final rows = <SgaGradeRow>[];
    final byId = {for (final s in sheet.students) s.enrollmentId: s};
    for (final e in _edits.entries) {
      final s = byId[e.key];
      if (s == null) continue;
      final mac = e.value[0] != null ? _parse(e.value[0]) : s.mac;
      final npp = e.value[1] != null ? _parse(e.value[1]) : s.npp;
      final npt = e.value[2] != null ? _parse(e.value[2]) : s.npt;
      final values = [mac, npp, npt];
      if (values.any((v) => v == null)) {
        _say('${s.name}: preencha MAC, NPP e NPT.', error: true);
        return;
      }
      if (values.any((v) => v! < 0 || v > 20)) {
        _say('${s.name}: as notas têm de estar entre 0 e 20.', error: true);
        return;
      }
      rows.add((enrollmentId: s.enrollmentId, mac: mac!, npp: npp!, npt: npt!));
    }
    if (rows.isEmpty) {
      _say('Não há notas alteradas para gravar.');
      return;
    }
    setState(() => _saving = true);
    try {
      await ref
          .read(sgaGradesRepositoryProvider)
          .save(a.subjectId, _term, rows);
      if (!mounted) return;
      _say(
        rows.length == 1
            ? 'Notas de 1 aluno gravadas.'
            : 'Notas de ${rows.length} alunos gravadas.',
      );
      setState(() {
        _edits.clear();
        _saving = false;
      });
      ref.invalidate(_sheetProvider((a, _term)));
    } on SgaRejected catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      _say(e.message, error: true);
    }
  }

  void _say(String text, {bool error = false}) =>
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(text),
          backgroundColor: error ? AppColors.error : null,
        ),
      );

  @override
  Widget build(BuildContext context) {
    final pad = getResponsiveHorizontalPadding(context);
    final configured = SgaConfig.fromEnvironment.portalUrl.isNotEmpty;
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text(
          'Notas',
          style: TextStyle(fontWeight: FontWeight.w600),
        ),
      ),
      body: ResponsiveConstrainedContent(
        child: !configured
            ? const EmptyHint(
                icon: LucideIcons.settings,
                message:
                    'Esta versão da app não tem o endereço do portal do SIGA (SGA_PORTAL_URL).',
              )
            : ref
                  .watch(_assignmentsProvider)
                  .when(
                    loading: () =>
                        const Center(child: CircularProgressIndicator()),
                    error: (e, _) => EmptyHint(
                      icon: LucideIcons.wifiOff,
                      message: e is SgaRejected
                          ? e.message
                          : 'Não foi possível carregar as suas turmas.',
                      action: TextButton(
                        onPressed: () => ref.invalidate(_assignmentsProvider),
                        child: const Text('Tentar de novo'),
                      ),
                    ),
                    data: (list) {
                      if (list.isEmpty) {
                        return const EmptyHint(
                          icon: LucideIcons.bookOpen,
                          message: 'Não tem disciplinas atribuídas no SIGA.',
                        );
                      }
                      final a = list.firstWhere(
                        (x) => x.key == _assignmentKey,
                        orElse: () => list.first,
                      );
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (list.length > 1)
                            Padding(
                              padding: EdgeInsets.fromLTRB(pad.left, 4, 0, 4),
                              child: PillTabs(
                                labels: [
                                  for (final x in list)
                                    '${x.className} · ${x.subjectName}',
                                ],
                                selected: list.indexOf(a),
                                onSelected: (i) async {
                                  if (!await _askDiscard()) return;
                                  setState(() {
                                    _assignmentKey = list[i].key;
                                    _edits.clear();
                                  });
                                },
                              ),
                            ),
                          Padding(
                            padding: EdgeInsets.fromLTRB(pad.left, 4, 0, 8),
                            child: PillTabs(
                              labels: const [
                                '1.º trimestre',
                                '2.º trimestre',
                                '3.º trimestre',
                              ],
                              selected: _term - 1,
                              onSelected: (i) async {
                                if (!await _askDiscard()) return;
                                setState(() {
                                  _term = i + 1;
                                  _edits.clear();
                                });
                              },
                            ),
                          ),
                          Expanded(child: _sheet(a, pad)),
                        ],
                      );
                    },
                  ),
      ),
    );
  }

  Widget _sheet(SgaAssignment a, EdgeInsets pad) {
    return ref
        .watch(_sheetProvider((a, _term)))
        .when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => EmptyHint(
            icon: LucideIcons.wifiOff,
            message: e is SgaRejected
                ? e.message
                : 'Não foi possível carregar as notas.',
            action: TextButton(
              onPressed: () => ref.invalidate(_sheetProvider((a, _term))),
              child: const Text('Tentar de novo'),
            ),
          ),
          data: (sheet) {
            if (sheet.students.isEmpty) {
              return const EmptyHint(
                icon: LucideIcons.users,
                message: 'Esta turma não tem alunos matriculados.',
              );
            }
            return Column(
              children: [
                Padding(
                  padding: EdgeInsets.fromLTRB(pad.left, 0, pad.right, 6),
                  child: Text(
                    'Escala 0–20. MT = (MAC + NPT) ÷ 2.'
                    '${sheet.provisional ? '' : ' O diário deste trimestre já fechou: o SIGA pode recusar alterações.'}',
                    style: TextStyle(
                      fontSize: 12,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ),
                Expanded(
                  child: ListView.separated(
                    padding: EdgeInsets.fromLTRB(pad.left, 0, pad.right, 16),
                    itemCount: sheet.students.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 8),
                    itemBuilder: (context, i) {
                      final s = sheet.students[i];
                      final edit = _edits[s.enrollmentId];
                      double? value(int f, double? original) =>
                          edit != null && edit[f] != null
                          ? _parse(edit[f])
                          : original;
                      final mt = trimesterAverage(
                        value(0, s.mac),
                        value(2, s.npt),
                      );
                      Widget field(
                        int f,
                        String label,
                        double? original,
                      ) => Expanded(
                        child: TextFormField(
                          key: ValueKey('${a.key}-$_term-${s.enrollmentId}-$f'),
                          initialValue: _fmt(original),
                          keyboardType: const TextInputType.numberWithOptions(
                            decimal: true,
                          ),
                          inputFormatters: [
                            FilteringTextInputFormatter.allow(
                              RegExp(r'[0-9.,]'),
                            ),
                          ],
                          textAlign: TextAlign.center,
                          decoration: InputDecoration(
                            labelText: label,
                            isDense: true,
                          ),
                          onChanged: (v) => setState(() {
                            final row = _edits.putIfAbsent(
                              s.enrollmentId,
                              () => [null, null, null],
                            );
                            row[f] = v;
                          }),
                        ),
                      );
                      return SoftCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                ProfilePhotoCircle(
                                  imageUrl: s.photoUrl,
                                  radius: 16,
                                  fallbackLabel: s.name,
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Text(
                                    s.name,
                                    style: TextStyle(
                                      fontSize: 15,
                                      color: AppColors.textPrimary,
                                    ),
                                  ),
                                ),
                                Text(
                                  mt == null ? 'MT —' : 'MT ${_fmt(mt)}',
                                  style: TextStyle(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w600,
                                    color: mt != null && mt < 10
                                        ? AppColors.error
                                        : AppColors.textPrimary,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 10),
                            Row(
                              children: [
                                field(0, 'MAC', s.mac),
                                const SizedBox(width: 8),
                                field(1, 'NPP', s.npp),
                                const SizedBox(width: 8),
                                field(2, 'NPT', s.npt),
                              ],
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                ),
                SafeArea(
                  top: false,
                  child: Padding(
                    padding: EdgeInsets.fromLTRB(pad.left, 4, pad.right, 12),
                    child: SizedBox(
                      width: double.infinity,
                      height: 52,
                      child: ElevatedButton(
                        onPressed: _saving || _edits.isEmpty
                            ? null
                            : () => _save(a, sheet),
                        child: _saving
                            ? SizedBox(
                                width: 22,
                                height: 22,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: AppColors.onPrimary,
                                ),
                              )
                            : Text(
                                _edits.isEmpty
                                    ? 'Gravar notas'
                                    : 'Gravar notas (${_edits.length} ${_edits.length == 1 ? 'aluno' : 'alunos'})',
                              ),
                      ),
                    ),
                  ),
                ),
              ],
            );
          },
        );
  }
}
