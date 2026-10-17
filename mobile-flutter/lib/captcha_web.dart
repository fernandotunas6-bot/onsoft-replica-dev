import 'dart:async';
import 'dart:js_interop';
import 'dart:js_interop_unsafe';
import 'dart:ui_web' as ui_web;

import 'package:flutter/widgets.dart';
import 'package:web/web.dart' as web;

import 'captcha.dart';

/// hCaptcha no formulário de autenticação Web.
///
/// A chave do site é pública e tem de fazer par com o segredo guardado no
/// Supabase (a mesma de VITE_HCAPTCHA_SITE_KEY no portal). Sem chave não se
/// rende nada: o pedido seguiria sem sinal e a recusa do Auth seria lida como
/// senha errada.
CaptchaGate buildCaptchaGate(String siteKey, VoidCallback onToken) =>
    siteKey.isEmpty
    ? const UnavailableCaptcha(configured: false, supported: true)
    : _HCaptchaGate(siteKey, onToken);

@JS('hcaptcha')
external _HCaptchaApi? get _hcaptcha;

extension type _HCaptchaApi._(JSObject _) implements JSObject {
  external String render(web.Element container, JSObject options);
  external void reset(String widgetId);
  external void remove(String widgetId);
}

const _readyCallback = '__sigaFlutterHcaptchaReady';
Future<void>? _script;

/// Carrega o api.js uma só vez por página, com render explícito.
Future<void> _loadHCaptcha() {
  if (_hcaptcha != null) return Future<void>.value();
  return _script ??= () {
    final ready = Completer<void>();
    web.window.setProperty(
      _readyCallback.toJS,
      (() {
        if (!ready.isCompleted) ready.complete();
      }).toJS,
    );
    final script = web.document.createElement('script') as web.HTMLScriptElement
      ..src =
          'https://js.hcaptcha.com/1/api.js?render=explicit&onload=$_readyCallback'
      ..async = true
      ..defer = true;
    script.onerror = ((JSAny _) {
      _script = null;
      if (!ready.isCompleted) {
        ready.completeError(
          StateError('Não foi possível carregar o hCaptcha.'),
        );
      }
    }).toJS;
    web.document.head!.append(script);
    return ready.future;
  }();
}

class _HCaptchaGate implements CaptchaGate {
  _HCaptchaGate(this.siteKey, this.onChanged) {
    ui_web.platformViewRegistry.registerViewFactory(
      _viewType,
      (int _) => _host,
    );
    unawaited(_render());
  }

  final String siteKey;
  final VoidCallback onChanged;
  final String _viewType =
      'siga-hcaptcha-${DateTime.now().microsecondsSinceEpoch}';
  final web.HTMLDivElement _host =
      web.document.createElement('div') as web.HTMLDivElement;
  String? _widgetId;
  String? _token;
  bool _failed = false;
  bool _disposed = false;

  @override
  bool get configured => true;
  @override
  bool get supported => true;
  @override
  String? get token => _token;

  Future<void> _render() async {
    try {
      await _loadHCaptcha();
    } catch (_) {
      _failed = true;
      if (!_disposed) onChanged();
      return;
    }
    final api = _hcaptcha;
    if (api == null || _disposed) {
      _failed = true;
      if (!_disposed) onChanged();
      return;
    }
    final options = JSObject();
    options.setProperty('sitekey'.toJS, siteKey.toJS);
    options.setProperty(
      'callback'.toJS,
      ((JSString value) => _accept(value.toDart)).toJS,
    );
    // Sinal expirado ou erro de rede: esquecer o token em vez de reenviar um
    // sinal gasto, que o Auth recusaria como captcha_failed.
    options.setProperty('expired-callback'.toJS, (() => _accept(null)).toJS);
    options.setProperty('error-callback'.toJS, (() => _accept(null)).toJS);
    try {
      _widgetId = api.render(_host, options);
    } catch (_) {
      _failed = true;
    }
    if (!_disposed) onChanged();
  }

  void _accept(String? value) {
    if (_disposed) return;
    _token = (value == null || value.isEmpty) ? null : value;
    onChanged();
  }

  @override
  Widget? build(BuildContext context) {
    if (_failed) {
      return const Text(
        'Não foi possível carregar a verificação anti-robô. Verifique a '
        'ligação e recarregue a página.',
      );
    }
    // A altura é a do widget padrão do hCaptcha; o host não se redimensiona.
    return SizedBox(height: 78, child: HtmlElementView(viewType: _viewType));
  }

  @override
  void reset() {
    _token = null;
    final id = _widgetId;
    if (id != null) {
      try {
        _hcaptcha?.reset(id);
      } catch (_) {
        /* widget já removido pela página */
      }
    }
    if (!_disposed) onChanged();
  }

  @override
  void dispose() {
    _disposed = true;
    final id = _widgetId;
    if (id != null) {
      try {
        _hcaptcha?.remove(id);
      } catch (_) {
        /* widget já removido pela página */
      }
    }
  }
}
