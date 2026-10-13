import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../design/tokens.dart';
import '../identity.dart';

/// Entrada com e-mail institucional e senha; depois, quando a conta o exige,
/// o código TOTP. A autorização continua a ser decidida pelo servidor.
class LoginPage extends StatefulWidget {
  const LoginPage({
    super.key,
    required this.auth,
    required this.onSync,
    this.factor,
  });
  final GoTrueClient auth;
  final Future<void> Function() onSync;
  final String? factor;
  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final email = TextEditingController();
  final password = TextEditingController();
  final code = TextEditingController();
  bool busy = false;
  bool hidden = true;
  String? error;

  Future<void> submit() async {
    if (busy) return;
    if (widget.factor == null &&
        (email.text.trim().isEmpty || password.text.isEmpty)) {
      setState(() => error = 'Preencha o e-mail e a senha.');
      return;
    }
    if (widget.factor != null &&
        !RegExp(r'^\d{6}$').hasMatch(code.text.trim())) {
      setState(() => error = 'Introduza os seis dígitos do código.');
      return;
    }
    final credential = password.text;
    password.clear();
    setState(() {
      busy = true;
      error = null;
    });
    try {
      if (widget.factor != null) {
        await widget.auth.mfa.challengeAndVerify(
          factorId: widget.factor!,
          code: code.text.trim(),
        );
      } else {
        await widget.auth.signInWithPassword(
          email: email.text.trim(),
          password: credential,
        );
      }
      password.clear();
      code.clear();
      await widget.onSync();
    } catch (_) {
      if (mounted) {
        setState(() => error = 'Verifique os seus dados e tente novamente.');
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  void dispose() {
    email.dispose();
    password.dispose();
    code.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final mfa = widget.factor != null;
    final theme = Theme.of(context);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(Siga.s3),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 400),
              child: AutofillGroup(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Center(child: Brand()),
                    const SizedBox(height: Siga.s4 + Siga.s2),
                    Semantics(
                      header: true,
                      child: Text(
                        mfa ? 'Confirme a sua identidade' : 'Aceda à sua conta',
                        style: theme.textTheme.headlineSmall,
                      ),
                    ),
                    const SizedBox(height: Siga.s1),
                    Text(
                      mfa
                          ? 'Introduza o código da sua aplicação autenticadora.'
                          : 'Use as credenciais institucionais. Depois de entrar, '
                                'escolhe a escola e o perfil.',
                      style: theme.textTheme.bodyMedium,
                    ),
                    const SizedBox(height: Siga.s3),
                    if (widget.factor == 'unsupported')
                      const Text(
                        'Use o portal original para confirmar o seu segundo '
                        'factor. Este cliente suporta TOTP.',
                      )
                    else if (mfa)
                      TextField(
                        controller: code,
                        keyboardType: TextInputType.number,
                        autofillHints: const [AutofillHints.oneTimeCode],
                        maxLength: 6,
                        onSubmitted: (_) => submit(),
                        decoration: const InputDecoration(
                          labelText: 'Código de autenticação',
                          prefixIcon: Icon(Icons.shield_outlined),
                        ),
                      )
                    else ...[
                      TextField(
                        controller: email,
                        keyboardType: TextInputType.emailAddress,
                        textInputAction: TextInputAction.next,
                        autofillHints: const [AutofillHints.username],
                        decoration: const InputDecoration(
                          labelText: 'E-mail institucional',
                          prefixIcon: Icon(Icons.mail_outline),
                        ),
                      ),
                      const SizedBox(height: Siga.s2),
                      TextField(
                        controller: password,
                        obscureText: hidden,
                        autofillHints: const [AutofillHints.password],
                        onSubmitted: (_) => submit(),
                        decoration: InputDecoration(
                          labelText: 'Senha',
                          prefixIcon: const Icon(Icons.lock_outline),
                          suffixIcon: IconButton(
                            tooltip: hidden ? 'Mostrar senha' : 'Ocultar senha',
                            onPressed: () => setState(() => hidden = !hidden),
                            icon: Icon(
                              hidden
                                  ? Icons.visibility_outlined
                                  : Icons.visibility_off_outlined,
                            ),
                          ),
                        ),
                      ),
                    ],
                    const SizedBox(height: Siga.s3),
                    FilledButton(
                      onPressed: busy || widget.factor == 'unsupported'
                          ? null
                          : submit,
                      child: Text(
                        busy
                            ? 'A confirmar…'
                            : mfa
                            ? 'Confirmar código'
                            : 'Entrar',
                      ),
                    ),
                    if (mfa) ...[
                      const SizedBox(height: Siga.s1),
                      TextButton(
                        onPressed: () => widget.auth.signOut(),
                        child: const Text('Sair desta conta'),
                      ),
                    ],
                    if (error != null) ...[
                      const SizedBox(height: Siga.s2),
                      Semantics(
                        liveRegion: true,
                        child: Text(
                          error!,
                          textAlign: TextAlign.center,
                          style: TextStyle(color: theme.colorScheme.error),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
