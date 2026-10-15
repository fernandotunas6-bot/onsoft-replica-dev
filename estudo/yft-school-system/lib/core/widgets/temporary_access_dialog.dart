import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:yft_school_system/core/theme/app_colors.dart';

/// Mostra o acesso de uma conta acabada de criar. O servidor devolve a senha
/// temporária uma só vez: se este diálogo for fechado sem a anotar, é
/// preciso pedir nova senha (recuperação por e-mail ou à administração).
Future<void> showTemporaryAccessDialog(
  BuildContext context, {
  required String who,
  required String? loginEmail,
  required String? temporaryPassword,
}) {
  if (temporaryPassword == null || temporaryPassword.isEmpty) {
    return Future.value();
  }
  final login = (loginEmail == null || loginEmail.isEmpty) ? '—' : loginEmail;
  return showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (ctx) => AlertDialog(
      title: Text('Acesso de $who'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Entregue estes dados à pessoa. A senha só aparece agora e deve '
            'ser trocada no primeiro acesso, em Perfil → Segurança e senha.',
            style: TextStyle(color: AppColors.textSecondary, fontSize: 13),
          ),
          const SizedBox(height: 16),
          const Text('Entrar com', style: TextStyle(fontSize: 12)),
          SelectableText(
            login,
            style: const TextStyle(fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 12),
          const Text('Senha temporária', style: TextStyle(fontSize: 12)),
          SelectableText(
            temporaryPassword,
            style: const TextStyle(
              fontWeight: FontWeight.bold,
              fontSize: 18,
              fontFamily: 'monospace',
              letterSpacing: 1.5,
            ),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Clipboard.setData(
            ClipboardData(text: '$login\n$temporaryPassword'),
          ),
          child: const Text('Copiar'),
        ),
        ElevatedButton(
          onPressed: () => Navigator.of(ctx).pop(),
          child: const Text('Já anotei'),
        ),
      ],
    ),
  );
}
