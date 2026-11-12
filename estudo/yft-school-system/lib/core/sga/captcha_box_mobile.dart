import 'dart:convert';
import 'dart:io' show Platform;

import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';

import 'sga_config.dart';

/// Android e iOS: o widget oficial do hCaptcha num WebView.
bool get captchaSupported => Platform.isAndroid || Platform.isIOS;

Widget buildCaptcha(String siteKey, ValueChanged<String?> onToken) =>
    _CaptchaWebView(siteKey: siteKey, onToken: onToken);

/// Página mínima com o widget; o token volta pelo canal `Captcha`.
String captchaPage(String siteKey) {
  // Escapa '<' para que nada na chave feche o <script>.
  final key = jsonEncode(siteKey).replaceAll('<', r'\u003c');
  return '''<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;background:transparent;display:flex;justify-content:center}</style>
<script>
function send(t){Captcha.postMessage(t||'');}
function onLoad(){hcaptcha.render('box',{sitekey:$key,callback:send,
'expired-callback':function(){send('')},'error-callback':function(){send('')}});}
</script>
<script src="https://js.hcaptcha.com/1/api.js?render=explicit&onload=onLoad&hl=pt" async defer
 onerror="Captcha.postMessage('__failed__')"></script>
</head><body><div id="box"></div></body></html>''';
}

class _CaptchaWebView extends StatefulWidget {
  final String siteKey;
  final ValueChanged<String?> onToken;
  const _CaptchaWebView({required this.siteKey, required this.onToken});

  @override
  State<_CaptchaWebView> createState() => _CaptchaWebViewState();
}

class _CaptchaWebViewState extends State<_CaptchaWebView> {
  late final WebViewController _controller;
  bool _failed = false;

  /// O hCaptcha só aceita os domínios da chave: a página carrega-se como se
  /// fosse do portal (SGA_PORTAL_URL), que tem de estar na lista da chave.
  static String get _origin {
    final portal = SgaConfig.fromEnvironment.portalUrl;
    return portal.isNotEmpty ? portal : 'https://m.portal-siga.com';
  }

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.transparent)
      ..addJavaScriptChannel(
        'Captcha',
        onMessageReceived: (m) {
          // Uma instância substituída não fala com o ecrã.
          if (!mounted) return;
          if (m.message == '__failed__') {
            widget.onToken(null);
            if (mounted) setState(() => _failed = true);
            return;
          }
          widget.onToken(m.message.isEmpty ? null : m.message);
        },
      )
      ..setNavigationDelegate(
        NavigationDelegate(
          onWebResourceError: (e) {
            if (e.isForMainFrame ?? false) {
              widget.onToken(null);
              if (mounted) setState(() => _failed = true);
            }
          },
        ),
      );
    _load();
  }

  void _load() =>
      _controller.loadHtmlString(captchaPage(widget.siteKey), baseUrl: _origin);

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
          TextButton(
            onPressed: () {
              setState(() => _failed = false);
              _load();
            },
            child: const Text('Tentar de novo'),
          ),
        ],
      );
    }
    // O desafio de imagens do hCaptcha abre por cima: altura para ele caber.
    return SizedBox(height: 520, child: WebViewWidget(controller: _controller));
  }
}
