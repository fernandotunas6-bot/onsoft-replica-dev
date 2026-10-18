import 'dart:async';
import 'dart:js_interop';
import 'dart:ui_web' as ui_web;

import 'package:flutter/material.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';
import 'package:web/web.dart' as web;

const captchaSupported = true;

@JS('hcaptcha')
external _HCaptcha? get _hcaptcha;

extension type _HCaptcha._(JSObject _) implements JSObject {
  external JSAny render(web.HTMLElement container, JSObject params);
  external void remove(JSAny widgetId);
}

Completer<void>? _loading;

/// Carrega o script do hCaptcha uma vez (modo explícito: nós chamamos render).
Future<void> _loadScript() {
  final existing = _loading;
  if (existing != null) return existing.future;
  final done = _loading = Completer<void>();
  final script = web.HTMLScriptElement()
    ..src = 'https://js.hcaptcha.com/1/api.js?render=explicit&hl=pt'
    ..async = true;
  script.onload = ((web.Event _) => done.complete()).toJS;
  script.onerror = ((web.Event _) {
    _loading = null;
    done.completeError(StateError('hCaptcha indisponível'));
  }).toJS;
  web.document.head!.append(script);
  return done.future;
}

var _nextId = 0;

Widget buildCaptcha(String siteKey, ValueChanged<String?> onToken) =>
    _CaptchaView(siteKey: siteKey, onToken: onToken);

class _CaptchaView extends StatefulWidget {
  final String siteKey;
  final ValueChanged<String?> onToken;
  const _CaptchaView({required this.siteKey, required this.onToken});

  @override
  State<_CaptchaView> createState() => _CaptchaViewState();
}

class _CaptchaViewState extends State<_CaptchaView> {
  late final String _viewType = 'siga-hcaptcha-${_nextId++}';
  final _box = web.HTMLDivElement();

  /// O script não carregou (sem rede, bloqueado): mostra-se porquê.
  bool _failed = false;

  /// Id do widget no hCaptcha, para o tirar quando este é substituído.
  JSAny? _widgetId;

  /// Só a instância à vista fala com o ecrã: um widget substituído (depois de
  /// uma tentativa falhada) não pode apagar o token do novo ao expirar.
  void _emit(String? token) {
    if (mounted) widget.onToken(token);
  }

  @override
  void initState() {
    super.initState();
    _box.style
      ..width = '100%'
      ..height = '100%'
      ..display = 'flex'
      ..justifyContent = 'center';
    ui_web.platformViewRegistry.registerViewFactory(_viewType, (int _) => _box);
    _render();
  }

  Future<void> _render() async {
    try {
      await _loadScript();
      // O render precisa da caixa já na página.
      while (mounted && !_box.isConnected) {
        await Future<void>.delayed(const Duration(milliseconds: 50));
      }
      if (!mounted) return;
      final params =
          {
                'sitekey': widget.siteKey,
                'callback': ((JSString token) => _emit(token.toDart)).toJS,
                'expired-callback': (() => _emit(null)).toJS,
                'error-callback': (() => _emit(null)).toJS,
              }.jsify()!
              as JSObject;
      _widgetId = _hcaptcha?.render(_box, params);
    } catch (_) {
      _emit(null);
      if (mounted) setState(() => _failed = true);
    }
  }

  @override
  void dispose() {
    final id = _widgetId;
    if (id != null) {
      try {
        _hcaptcha?.remove(id);
      } catch (_) {}
    }
    super.dispose();
  }

  void _retry() {
    setState(() => _failed = false);
    _render();
  }

  @override
  Widget build(BuildContext context) {
    if (_failed) {
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            'Não foi possível carregar a verificação "não sou um robô". '
            'Confirme a ligação à internet.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
          ),
          TextButton(onPressed: _retry, child: const Text('Tentar de novo')),
        ],
      );
    }
    return SizedBox(height: 84, child: HtmlElementView(viewType: _viewType));
  }
}
