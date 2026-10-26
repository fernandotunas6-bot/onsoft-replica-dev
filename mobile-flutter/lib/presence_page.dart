import 'dart:async';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'presence.dart';

/// Ecrã «Presença na sala» do professor: ler o QR da escola, ver as aulas de
/// hoje e as leituras guardadas sem rede.
class PresencePage extends StatefulWidget {
  const PresencePage({
    super.key,
    required this.api,
    required this.prefs,
    required this.schoolId,
  });
  final PresenceApi api;
  final SharedPreferences prefs;
  final String schoolId;

  @override
  State<PresencePage> createState() => _PresencePageState();
}

class _PresencePageState extends State<PresencePage> {
  late final queue = PresenceQueue(widget.prefs);
  PresenceToday? today;
  String? error;
  bool loading = true;
  bool offline = false;
  bool working = false;
  List<PendingScan> pending = const [];
  Timer? retry;

  String get _modeKey => 'presence-mode-${widget.schoolId}';

  PresenceMode get mode =>
      today?.mode ?? presenceModeOf(widget.prefs.getString(_modeKey));

  @override
  void initState() {
    super.initState();
    pending = queue.read();
    unawaited(load());
    // Zonas com rede intermitente: tenta enviar a fila de 2 em 2 minutos.
    retry = Timer.periodic(const Duration(minutes: 2), (_) {
      if (queue.read().isNotEmpty) unawaited(flush(silent: true));
    });
  }

  @override
  void dispose() {
    retry?.cancel();
    super.dispose();
  }

  Future<void> load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final result = await widget.api.today(widget.schoolId);
      await widget.prefs.setString(_modeKey, result.mode.name);
      if (!mounted) return;
      setState(() {
        today = result;
        offline = false;
      });
      if (queue.read().isNotEmpty) unawaited(flush(silent: true));
    } on PresenceFailure catch (failure) {
      if (!mounted) return;
      setState(() {
        offline = failure.network;
        error = failure.network ? null : failure.message;
      });
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> flush({bool silent = false}) async {
    final result = await flushPresenceQueue(widget.api, queue);
    if (!mounted) return;
    setState(() => pending = queue.read());
    final messenger = ScaffoldMessenger.of(context);
    if (result.sent > 0) {
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            result.sent == 1
                ? 'Leitura guardada sem rede enviada.'
                : '${result.sent} leituras guardadas sem rede enviadas.',
          ),
        ),
      );
      unawaited(load());
    } else if (!silent && pending.isNotEmpty) {
      messenger.showSnackBar(
        const SnackBar(content: Text('Ainda sem internet. Tentamos depois.')),
      );
    }
    for (final message in result.refused) {
      messenger.showSnackBar(
        SnackBar(content: Text('Leitura guardada recusada: $message')),
      );
    }
  }

  Future<void> scan() async {
    final token = await Navigator.of(context).push<String>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => const SchoolQrScannerScreen(),
      ),
    );
    if (token == null || !mounted) return;
    setState(() => working = true);
    final scannedAt = DateTime.now();
    final position = await _currentPosition();
    final pendingScan = PendingScan(
      opId: newOpId(),
      schoolId: widget.schoolId,
      token: token,
      deviceScannedAt: scannedAt,
      latitude: position?.latitude,
      longitude: position?.longitude,
      accuracy: position?.accuracy,
      mocked: position?.isMocked,
    );
    _Outcome outcome;
    try {
      final result = await widget.api.submit(pendingScan, offline: false);
      outcome = _Outcome.result(result);
      unawaited(load());
    } on PresenceFailure catch (failure) {
      if (failure.network) {
        await queue.add(pendingScan);
        outcome = const _Outcome.queued();
      } else {
        outcome = _Outcome.error(failure.message);
      }
    }
    if (!mounted) return;
    setState(() {
      working = false;
      pending = queue.read();
      if (outcome.queued) offline = true;
    });
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _OutcomeSheet(outcome: outcome, onRetry: scan),
    );
  }

  Future<Position?> _currentPosition() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) return null;
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        return null;
      }
      return await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 12),
        ),
      );
    } catch (_) {
      // Sem localização a leitura conta na mesma, mas fica para a Direcção rever.
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lessons = today?.lessons ?? const <PresenceLesson>[];
    return RefreshIndicator(
      onRefresh: load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
        children: [
          _HeroCard(
            mode: mode,
            working: working,
            onScan: mode == PresenceMode.off ? null : scan,
          ),
          const SizedBox(height: 12),
          if (offline || pending.isNotEmpty)
            _QueueBanner(
              offline: offline,
              pending: pending.length,
              onSend: pending.isEmpty ? null : () => flush(),
            ),
          if (error != null)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: _Notice(
                icon: Icons.error_outline,
                color: theme.colorScheme.error,
                text: error!,
              ),
            ),
          const SizedBox(height: 20),
          Row(
            children: [
              Expanded(
                child: Text('Aulas de hoje', style: theme.textTheme.titleLarge),
              ),
              if (loading)
                const SizedBox.square(
                  dimension: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              else
                IconButton(
                  tooltip: 'Actualizar',
                  onPressed: load,
                  icon: const Icon(Icons.refresh),
                ),
            ],
          ),
          const SizedBox(height: 8),
          if (!loading && today == null && offline)
            const _Notice(
              icon: Icons.wifi_off_outlined,
              text:
                  'Sem internet. Pode ler o QR na mesma: a leitura fica guardada e a lista de aulas aparece quando houver rede.',
            )
          else if (!loading && today != null && lessons.isEmpty)
            const _Notice(
              icon: Icons.event_busy_outlined,
              text:
                  'Sem aulas suas no horário de hoje. Se devia ter, fale com a Direcção Pedagógica.',
            ),
          for (final lesson in lessons) _LessonTile(lesson: lesson),
          const SizedBox(height: 20),
          const _Tips(),
        ],
      ),
    );
  }
}

class _HeroCard extends StatelessWidget {
  const _HeroCard({
    required this.mode,
    required this.working,
    required this.onScan,
  });
  final PresenceMode mode;
  final bool working;
  final VoidCallback? onScan;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final start = dark ? const Color(0xff2a3f8f) : const Color(0xff315ff6);
    final end = dark ? const Color(0xff1d2a5c) : const Color(0xff1f3fb8);
    final subtitle = switch (mode) {
      PresenceMode.qr =>
        'Antes de cada aula, leia o QR mostrado pela Direcção. Funciona sem internet.',
      PresenceMode.button =>
        'A escola aceita o botão «Estou na sala» e também o QR da escola.',
      PresenceMode.off =>
        'A confirmação de presença está desligada nesta escola.',
    };
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [start, end],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: .16),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: const Icon(
                  Icons.qr_code_2,
                  color: Colors.white,
                  size: 26,
                ),
              ),
              const SizedBox(width: 12),
              const Expanded(
                child: Text(
                  'Presença na sala',
                  style: TextStyle(
                    fontFamily: 'Inter',
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.w600,
                    letterSpacing: -.4,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            subtitle,
            style: TextStyle(
              fontFamily: 'Inter',
              color: Colors.white.withValues(alpha: .86),
              fontSize: 14,
              height: 1.5,
            ),
          ),
          const SizedBox(height: 18),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              style: FilledButton.styleFrom(
                backgroundColor: Colors.white,
                // Azul fixo: no tema escuro a cor de acção é clara e some no botão branco.
                foregroundColor: const Color(0xff1f3fb8),
                disabledBackgroundColor: Colors.white.withValues(alpha: .3),
                minimumSize: const Size.fromHeight(54),
              ),
              onPressed: working ? null : onScan,
              icon: working
                  ? const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.qr_code_scanner),
              label: Text(working ? 'A registar…' : 'Ler QR da escola'),
            ),
          ),
        ],
      ),
    );
  }
}

class _QueueBanner extends StatelessWidget {
  const _QueueBanner({
    required this.offline,
    required this.pending,
    required this.onSend,
  });
  final bool offline;
  final int pending;
  final VoidCallback? onSend;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final text = pending == 0
        ? 'Sem internet agora. As leituras ficam guardadas no telemóvel.'
        : pending == 1
        ? '1 leitura guardada, à espera de internet.'
        : '$pending leituras guardadas, à espera de internet.';
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 10, 8, 10),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.outlineVariant),
      ),
      child: Row(
        children: [
          Icon(
            offline ? Icons.wifi_off_outlined : Icons.cloud_upload_outlined,
            size: 20,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(text, style: Theme.of(context).textTheme.bodyMedium),
          ),
          if (onSend != null)
            TextButton(onPressed: onSend, child: const Text('Enviar')),
        ],
      ),
    );
  }
}

class _LessonTile extends StatelessWidget {
  const _LessonTile({required this.lesson});
  final PresenceLesson lesson;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final (label, color, icon) = lesson.cancelled
        ? ('Cancelada', colors.onSurfaceVariant, Icons.block)
        : lesson.confirmed
        ? (lesson.lateMinutes ?? 0) > 5
              ? (
                  'Confirmada · ${lesson.lateMinutes} min de atraso',
                  const Color(0xffb7791f),
                  Icons.check_circle,
                )
              : ('Confirmada', const Color(0xff1f9d55), Icons.check_circle)
        : ('Por confirmar', const Color(0xffb7791f), Icons.schedule);
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.outlineVariant),
      ),
      child: Row(
        children: [
          // Hora de início em destaque e fim por baixo, como num horário.
          SizedBox(
            width: 64,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  lesson.timeRange.split('–').first,
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
                if (lesson.timeRange.contains('–'))
                  Text(
                    lesson.timeRange.split('–').last,
                    style: theme.textTheme.bodySmall?.copyWith(
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
              ],
            ),
          ),
          Container(
            width: 1,
            height: 36,
            margin: const EdgeInsets.only(right: 14),
            color: colors.outlineVariant,
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${lesson.className} · ${lesson.subjectName}',
                  style: theme.textTheme.titleMedium,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Icon(icon, size: 14, color: color),
                    const SizedBox(width: 4),
                    Flexible(
                      child: Text(
                        lesson.room == null
                            ? label
                            : '$label · Sala ${lesson.room}',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: color,
                          fontWeight: FontWeight.w600,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice({required this.icon, required this.text, this.color});
  final IconData icon;
  final String text;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.outlineVariant),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: color),
          const SizedBox(width: 10),
          Expanded(
            child: Text(text, style: Theme.of(context).textTheme.bodyMedium),
          ),
        ],
      ),
    );
  }
}

class _Tips extends StatelessWidget {
  const _Tips();
  @override
  Widget build(BuildContext context) {
    final style = Theme.of(context).textTheme.bodySmall;
    Widget tip(IconData icon, String text) => Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 16),
          const SizedBox(width: 8),
          Expanded(child: Text(text, style: style)),
        ],
      ),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        tip(
          Icons.schedule,
          'Pode ler a partir de 15 minutos antes do início da aula.',
        ),
        tip(
          Icons.location_on_outlined,
          'Autorize a localização: confirma que está na escola.',
        ),
        tip(
          Icons.wifi_off_outlined,
          'Sem internet, a leitura fica guardada até 72 horas e segue sozinha.',
        ),
      ],
    );
  }
}

class _Outcome {
  const _Outcome.result(ScanResult this.result) : queued = false, error = null;
  const _Outcome.queued() : result = null, queued = true, error = null;
  const _Outcome.error(String this.error) : result = null, queued = false;
  final ScanResult? result;
  final bool queued;
  final String? error;
}

class _OutcomeSheet extends StatelessWidget {
  const _OutcomeSheet({required this.outcome, required this.onRetry});
  final _Outcome outcome;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final result = outcome.result;
    final (icon, color, title, message) = outcome.queued
        ? (
            Icons.cloud_queue,
            theme.colorScheme.primary,
            'Leitura guardada sem rede',
            'A hora e o local ficaram registados. Enviamos quando houver internet.',
          )
        : outcome.error != null
        ? (
            Icons.cancel,
            theme.colorScheme.error,
            'Não foi possível registar',
            outcome.error!,
          )
        : switch (result!.decision) {
            ScanDecision.accepted => (
              Icons.check_circle,
              const Color(0xff1f9d55),
              'Presença confirmada',
              result.message,
            ),
            ScanDecision.review => (
              Icons.hourglass_top,
              const Color(0xffb7791f),
              'Por rever pela Direcção',
              result.message,
            ),
            ScanDecision.rejected => (
              Icons.cancel,
              theme.colorScheme.error,
              'Leitura recusada',
              result.message,
            ),
          };
    final retry =
        outcome.error != null || result?.decision == ScanDecision.rejected;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TweenAnimationBuilder<double>(
              tween: Tween(begin: .6, end: 1),
              duration: MediaQuery.disableAnimationsOf(context)
                  ? Duration.zero
                  : const Duration(milliseconds: 380),
              curve: Curves.easeOutBack,
              builder: (_, scale, child) =>
                  Transform.scale(scale: scale, child: child),
              child: Container(
                width: 72,
                height: 72,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: .12),
                  shape: BoxShape.circle,
                ),
                child: Icon(icon, color: color, size: 40),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              title,
              style: theme.textTheme.titleLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              message,
              style: theme.textTheme.bodyMedium,
              textAlign: TextAlign.center,
            ),
            if (result != null && result.lessons.isNotEmpty) ...[
              const SizedBox(height: 12),
              for (final lesson in result.lessons)
                Text(lesson, style: theme.textTheme.bodySmall),
            ],
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: retry
                  ? FilledButton.icon(
                      onPressed: () {
                        Navigator.of(context).pop();
                        onRetry();
                      },
                      icon: const Icon(Icons.qr_code_scanner),
                      label: const Text('Ler outra vez'),
                    )
                  : FilledButton(
                      onPressed: () => Navigator.of(context).pop(),
                      child: const Text('Concluído'),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Câmara em ecrã inteiro com moldura; devolve o texto do QR da escola.
class SchoolQrScannerScreen extends StatefulWidget {
  const SchoolQrScannerScreen({super.key});
  @override
  State<SchoolQrScannerScreen> createState() => _SchoolQrScannerScreenState();
}

class _SchoolQrScannerScreenState extends State<SchoolQrScannerScreen>
    with SingleTickerProviderStateMixin {
  final controller = MobileScannerController(
    formats: const [BarcodeFormat.qrCode],
    detectionSpeed: DetectionSpeed.noDuplicates,
  );
  late final AnimationController line = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1800),
  );
  bool done = false;
  bool wrongCode = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      line.stop();
    } else if (!line.isAnimating) {
      line.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    line.dispose();
    controller.dispose();
    super.dispose();
  }

  void onDetect(BarcodeCapture capture) {
    if (done) return;
    for (final code in capture.barcodes) {
      final value = code.rawValue?.trim();
      if (isSchoolQr(value)) {
        done = true;
        Navigator.of(context).pop(value);
        return;
      }
    }
    if (!wrongCode) setState(() => wrongCode = true);
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    final box = (size.shortestSide * .72).clamp(200.0, 340.0);
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          MobileScanner(
            controller: controller,
            onDetect: onDetect,
            errorBuilder: (context, error) => _CameraError(error: error),
          ),
          IgnorePointer(
            child: CustomPaint(painter: _FramePainter(box: box)),
          ),
          Center(
            child: SizedBox.square(
              dimension: box,
              child: AnimatedBuilder(
                animation: line,
                builder: (_, _) => Align(
                  alignment: Alignment(0, line.value * 2 - 1),
                  child: Container(
                    height: 2,
                    margin: const EdgeInsets.symmetric(horizontal: 16),
                    color: Colors.white.withValues(alpha: .8),
                  ),
                ),
              ),
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(8),
              child: Row(
                children: [
                  IconButton(
                    tooltip: 'Fechar',
                    color: Colors.white,
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close),
                  ),
                  const Spacer(),
                  IconButton(
                    tooltip: 'Lanterna',
                    color: Colors.white,
                    onPressed: () => controller.toggleTorch(),
                    icon: const Icon(Icons.flashlight_on_outlined),
                  ),
                ],
              ),
            ),
          ),
          Align(
            alignment: Alignment.bottomCenter,
            child: SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(32, 0, 32, 40),
                child: Text(
                  wrongCode
                      ? 'Este código não é o QR de presença da escola.'
                      : 'Aponte a câmara ao QR mostrado pela Direcção.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontFamily: 'Inter',
                    color: Colors.white,
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                    height: 1.5,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _FramePainter extends CustomPainter {
  _FramePainter({required this.box});
  final double box;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Rect.fromCenter(
      center: size.center(Offset.zero),
      width: box,
      height: box,
    );
    final hole = RRect.fromRectAndRadius(rect, const Radius.circular(28));
    canvas.drawPath(
      Path.combine(
        PathOperation.difference,
        Path()..addRect(Offset.zero & size),
        Path()..addRRect(hole),
      ),
      Paint()..color = Colors.black.withValues(alpha: .55),
    );
    canvas.drawRRect(
      hole,
      Paint()
        ..color = Colors.white
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3,
    );
  }

  @override
  bool shouldRepaint(_FramePainter old) => old.box != box;
}

class _CameraError extends StatelessWidget {
  const _CameraError({required this.error});
  final MobileScannerException error;
  @override
  Widget build(BuildContext context) {
    final denied = error.errorCode == MobileScannerErrorCode.permissionDenied;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Text(
          denied
              ? 'Sem acesso à câmara. Autorize a câmara nas definições do telemóvel.'
              : 'Não foi possível abrir a câmara.',
          textAlign: TextAlign.center,
          style: const TextStyle(color: Colors.white, fontSize: 15),
        ),
      ),
    );
  }
}
