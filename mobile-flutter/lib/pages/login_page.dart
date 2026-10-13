import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../design/tokens.dart';
import '../design/widgets.dart';
import '../identity.dart';

/// Entrada (ecrã 5). E-mail institucional e senha; depois, quando a conta o
/// exige, o código TOTP. Google, Microsoft e Apple só funcionam quando o
/// `.env` os liga. A autorização continua a ser decidida pelo servidor.
class LoginPage extends StatefulWidget {
  const LoginPage({
    super.key,
    required this.auth,
    required this.onSync,
    this.factor,
    this.onGoogle,
    this.onMicrosoft,
    this.onApple,
    this.recoveryRedirect,
    this.lastSchool,
  });
  final GoTrueClient auth;
  final Future<void> Function() onSync;
  final String? factor;
  final Future<void> Function()? onGoogle;
  final Future<void> Function()? onMicrosoft;
  final Future<void> Function()? onApple;

  /// Para onde aponta o link do e-mail de recuperação de senha.
  final String? recoveryRedirect;

  /// Última escola usada neste dispositivo, se houver.
  final String? lastSchool;

  @override
  State<LoginPage> createState() => _LoginPageState();
}

final _email = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');

class _LoginPageState extends State<LoginPage> {
  final email = TextEditingController();
  final password = TextEditingController();
  final code = TextEditingController();
  bool busy = false;
  bool hidden = true;
  String? error;
  String? notice;

  void fail(String message) => setState(() {
    error = message;
    notice = null;
  });

  Future<void> submit() async {
    if (busy) return;
    final identifier = email.text.trim();
    if (widget.factor == null) {
      if (identifier.isEmpty || password.text.isEmpty) {
        return fail('Preencha o e-mail e a senha.');
      }
      if (!_email.hasMatch(identifier)) {
        return fail(
          'Entrar com o ID da escola ou o B.I. ainda não está disponível na '
          'app. Use o e-mail institucional.',
        );
      }
    } else if (!RegExp(r'^\d{6}$').hasMatch(code.text.trim())) {
      return fail('Introduza os seis dígitos do código.');
    }
    final credential = password.text;
    password.clear();
    setState(() {
      busy = true;
      error = notice = null;
    });
    try {
      if (widget.factor != null) {
        await widget.auth.mfa.challengeAndVerify(
          factorId: widget.factor!,
          code: code.text.trim(),
        );
      } else {
        await widget.auth.signInWithPassword(
          email: identifier,
          password: credential,
        );
      }
      password.clear();
      code.clear();
      await widget.onSync();
    } catch (_) {
      if (mounted) fail('Verifique os seus dados e tente novamente.');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> recover() async {
    final identifier = email.text.trim();
    if (!_email.hasMatch(identifier)) {
      return fail('Escreva o e-mail institucional para recuperar a senha.');
    }
    setState(() {
      busy = true;
      error = notice = null;
    });
    try {
      await widget.auth.resetPasswordForEmail(
        identifier,
        redirectTo: widget.recoveryRedirect,
      );
      if (mounted) {
        setState(
          () => notice =
              'Se a conta existir, enviámos as instruções para $identifier.',
        );
      }
    } catch (_) {
      if (mounted) fail('Não foi possível enviar o e-mail de recuperação.');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> social(String name, Future<void> Function()? open) async {
    if (open == null) {
      return fail('Entrar com $name ainda não está activo nesta app.');
    }
    if (busy) return;
    setState(() {
      busy = true;
      error = notice = null;
    });
    try {
      await open();
    } catch (_) {
      if (mounted) fail('Não foi possível abrir a entrada com $name.');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  void explainSchool() => showSigaSheet<void>(
    context,
    title: 'Seleccione a escola',
    builder: (context) => const Text(
      'Depois de entrar, aparecem as escolas com vínculo à sua conta e '
      'escolhe a escola e o perfil. Assim, nenhuma lista de escolas fica '
      'visível antes da autenticação.',
    ),
  );

  @override
  void dispose() {
    email.dispose();
    password.dispose();
    code.dispose();
    super.dispose();
  }

  InputDecoration field(String hint, IconData icon, {Widget? suffix}) =>
      InputDecoration(
        hintText: hint,
        prefixIcon: Icon(icon, size: 20),
        suffixIcon: suffix,
        filled: true,
        fillColor: Theme.of(context).colorScheme.surface,
      );

  @override
  Widget build(BuildContext context) {
    final mfa = widget.factor != null;
    final theme = Theme.of(context);
    final palette = SigaPalette.of(context);
    return Scaffold(
      body: SafeArea(
        // Alinhado ao topo, com a marca em cima, como no ecrã 5.
        child: Align(
          alignment: Alignment.topCenter,
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(
              Siga.s3,
              Siga.s3,
              Siga.s3,
              Siga.s3,
            ),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: AutofillGroup(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Center(child: Brand(size: 26)),
                    const SizedBox(height: Siga.s4),
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
                          : 'Seleccione a sua escola e utilize as suas '
                                'credenciais institucionais.',
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
                        decoration: field(
                          'Código de autenticação',
                          LucideIcons.shield,
                        ),
                      )
                    else ...[
                      Material(
                        color: theme.colorScheme.surface,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(Siga.rSmall),
                          side: BorderSide(color: palette.line),
                        ),
                        child: InkWell(
                          borderRadius: BorderRadius.circular(Siga.rSmall),
                          onTap: explainSchool,
                          child: Padding(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 15,
                            ),
                            child: Row(
                              children: [
                                Icon(
                                  LucideIcons.graduationCap,
                                  size: 20,
                                  color: palette.ink2,
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Text(
                                    widget.lastSchool ?? 'Seleccione a escola',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                                const Icon(LucideIcons.chevronDown, size: 20),
                              ],
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: email,
                        keyboardType: TextInputType.emailAddress,
                        textInputAction: TextInputAction.next,
                        autofillHints: const [AutofillHints.username],
                        decoration: field(
                          'E-mail, ID da escola ou B.I.',
                          LucideIcons.mail,
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: password,
                        obscureText: hidden,
                        autofillHints: const [AutofillHints.password],
                        onSubmitted: (_) => submit(),
                        decoration: field(
                          'Senha',
                          LucideIcons.keyRound,
                          suffix: IconButton(
                            tooltip: hidden ? 'Mostrar senha' : 'Ocultar senha',
                            onPressed: () => setState(() => hidden = !hidden),
                            icon: Icon(
                              hidden ? LucideIcons.eye : LucideIcons.eyeOff,
                              size: 20,
                            ),
                          ),
                        ),
                      ),
                      Align(
                        alignment: Alignment.centerRight,
                        child: TextButton(
                          onPressed: busy ? null : recover,
                          child: const Text('Esqueceu a senha?'),
                        ),
                      ),
                    ],
                    const SizedBox(height: Siga.s1),
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
                    if (error != null || notice != null) ...[
                      const SizedBox(height: Siga.s2),
                      Semantics(
                        liveRegion: true,
                        child: Text(
                          error ?? notice!,
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: error != null
                                ? theme.colorScheme.error
                                : theme.colorScheme.primary,
                          ),
                        ),
                      ),
                    ],
                    if (mfa) ...[
                      const SizedBox(height: Siga.s1),
                      TextButton(
                        onPressed: () => widget.auth.signOut(),
                        child: const Text('Sair desta conta'),
                      ),
                    ] else ...[
                      const SizedBox(height: Siga.s3),
                      Center(
                        child: Text(
                          'ou continuar com',
                          style: theme.textTheme.bodySmall,
                        ),
                      ),
                      const SizedBox(height: Siga.s2),
                      Row(
                        children: [
                          Expanded(
                            child: _SocialButton(
                              label: 'Continuar com Google',
                              onTap: () => social('Google', widget.onGoogle),
                              child: const _GoogleMark(),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: _SocialButton(
                              label: 'Continuar com Microsoft',
                              onTap: () =>
                                  social('Microsoft', widget.onMicrosoft),
                              child: const _MicrosoftMark(),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: _SocialButton(
                              label: 'Continuar com Apple',
                              onTap: () => social('Apple', widget.onApple),
                              child: Icon(
                                Icons.apple,
                                size: 26,
                                color: theme.colorScheme.onSurface,
                              ),
                            ),
                          ),
                        ],
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

class _SocialButton extends StatelessWidget {
  const _SocialButton({
    required this.label,
    required this.onTap,
    required this.child,
  });
  final String label;
  final VoidCallback onTap;
  final Widget child;
  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    label: label,
    excludeSemantics: true,
    child: Material(
      color: Theme.of(context).colorScheme.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(Siga.rMedium),
        side: BorderSide(color: SigaPalette.of(context).line),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(Siga.rMedium),
        child: SizedBox(height: 52, child: Center(child: child)),
      ),
    ),
  );
}

/// «G» com as quatro cores, desenhado em texto.
class _GoogleMark extends StatelessWidget {
  const _GoogleMark();
  @override
  Widget build(BuildContext context) => ShaderMask(
    blendMode: BlendMode.srcIn,
    shaderCallback: const SweepGradient(
      colors: [
        Color(0xffea4335),
        Color(0xfffbbc05),
        Color(0xff34a853),
        Color(0xff4285f4),
        Color(0xffea4335),
      ],
    ).createShader,
    child: const Text(
      'G',
      style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700, height: 1),
    ),
  );
}

/// Quatro quadrados, como na referência.
class _MicrosoftMark extends StatelessWidget {
  const _MicrosoftMark();
  @override
  Widget build(BuildContext context) {
    Widget square() =>
        Container(width: 10, height: 10, color: const Color(0xff1f6bff));
    return SizedBox(
      width: 22,
      height: 22,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [square(), square()],
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [square(), square()],
          ),
        ],
      ),
    );
  }
}
