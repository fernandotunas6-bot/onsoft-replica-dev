import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'design.dart';
import 'identity.dart';

/// Explains a control that the approved design shows but this client cannot
/// honour yet. Never silently pretend the action worked.
Future<void> pending(BuildContext context, String title, String detail) =>
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Sg.gutter, 0, Sg.gutter, Sg.gapL),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: Sg.section.copyWith(
                  fontSize: 20,
                  color: Sg.of(context).text,
                ),
              ),
              const SizedBox(height: Sg.gap),
              Text(
                detail,
                style: Sg.body.copyWith(color: Sg.of(context).muted),
              ),
              const SizedBox(height: Sg.gapL),
              FilledButton(
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('Entendido'),
              ),
            ],
          ),
        ),
      ),
    );

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
  bool visible = false;
  String? error;

  Future<void> submit() async {
    if (busy) return;
    if (widget.factor == null &&
        (email.text.trim().isEmpty || password.text.isEmpty)) {
      setState(() {
        error = 'Preencha o e-mail e a senha.';
      });
      return;
    }
    if (widget.factor != null &&
        !RegExp(r'^\d{6}$').hasMatch(code.text.trim())) {
      setState(() {
        error = 'Introduza os seis dígitos do código.';
      });
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
        setState(() {
          error = 'Verifique os seus dados e tente novamente.';
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          busy = false;
        });
      }
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
    final palette = Sg.of(context);
    final mfa = widget.factor != null;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(
              Sg.gutter,
              Sg.gapXl,
              Sg.gutter,
              Sg.gapL,
            ),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: Sg.maxContent),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Center(child: Brand(size: 26)),
                  const SizedBox(height: Sg.gapXl),
                  Text(
                    mfa ? 'Confirme a sua identidade' : 'Aceda à sua conta',
                    style: Sg.title.copyWith(color: palette.text),
                  ),
                  const SizedBox(height: Sg.gapS),
                  Text(
                    mfa
                        ? 'Introduza o código de seis dígitos da sua aplicação de autenticação.'
                        : 'Use as suas credenciais institucionais. A escola é confirmada a seguir, pelos vínculos activos.',
                    style: Sg.body.copyWith(color: palette.muted),
                  ),
                  const SizedBox(height: Sg.gapL),
                  if (widget.factor == 'unsupported')
                    _Notice(
                      'Este cliente suporta apenas TOTP. Confirme o segundo factor no portal e volte a entrar.',
                    )
                  else if (mfa)
                    TextField(
                      controller: code,
                      keyboardType: TextInputType.number,
                      autofillHints: const [AutofillHints.oneTimeCode],
                      maxLength: 6,
                      decoration: const InputDecoration(
                        labelText: 'Código de autenticação',
                        counterText: '',
                        prefixIcon: Icon(Icons.lock_clock_outlined, size: 20),
                      ),
                    )
                  else ...[
                    _SelectorField(
                      icon: Icons.apartment_outlined,
                      label: 'Seleccione a escola',
                      onTap: () => pending(
                        context,
                        'Escola depois de entrar',
                        'A lista pública de escolas precisa de um contrato próprio, com protecção contra '
                            'enumeração. Neste cliente a escola é escolhida a seguir, a partir dos vínculos '
                            'activos confirmados pelo servidor.',
                      ),
                    ),
                    const SizedBox(height: Sg.gap),
                    TextField(
                      controller: email,
                      keyboardType: TextInputType.emailAddress,
                      autofillHints: const [AutofillHints.username],
                      decoration: const InputDecoration(
                        hintText: 'E-mail institucional',
                        prefixIcon: Icon(Icons.mail_outline, size: 20),
                      ),
                    ),
                    const SizedBox(height: Sg.gap),
                    TextField(
                      controller: password,
                      obscureText: !visible,
                      autofillHints: const [AutofillHints.password],
                      onSubmitted: (_) => submit(),
                      decoration: InputDecoration(
                        hintText: 'Senha',
                        prefixIcon: const Icon(Icons.lock_outline, size: 20),
                        suffixIcon: IconButton(
                          tooltip: visible ? 'Ocultar senha' : 'Mostrar senha',
                          icon: Icon(
                            visible
                                ? Icons.visibility_off_outlined
                                : Icons.visibility_outlined,
                            size: 20,
                          ),
                          onPressed: () => setState(() {
                            visible = !visible;
                          }),
                        ),
                      ),
                    ),
                    Align(
                      alignment: Alignment.centerRight,
                      child: TextButton(
                        onPressed: () => pending(
                          context,
                          'Recuperação no portal',
                          'A recuperação de senha exige fluxo completo de sessão, CAPTCHA e invalidação '
                              'das sessões activas. Até estar integrada aqui, faça-a no portal da escola.',
                        ),
                        child: const Text('Esqueceu a senha?'),
                      ),
                    ),
                  ],
                  const SizedBox(height: Sg.gapS),
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
                  if (error != null) ...[
                    const SizedBox(height: Sg.gap),
                    _Notice(error!, tone: Sg.danger),
                  ],
                  if (mfa)
                    TextButton(
                      onPressed: () => widget.auth.signOut(),
                      child: const Text('Sair desta conta'),
                    ),
                  if (!mfa) ...[
                    const SizedBox(height: Sg.gapL),
                    Row(
                      children: [
                        Expanded(child: Divider(color: palette.border)),
                        Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: Sg.gap,
                          ),
                          child: Text(
                            'ou continuar com',
                            style: Sg.caption.copyWith(color: palette.muted),
                          ),
                        ),
                        Expanded(child: Divider(color: palette.border)),
                      ],
                    ),
                    const SizedBox(height: Sg.gapM),
                    Row(
                      children: [
                        for (final provider in const [
                          ('Google', Icons.g_mobiledata, 'Google'),
                          ('Microsoft', Icons.window_outlined, 'Microsoft'),
                          ('Apple', Icons.apple, 'Apple'),
                        ])
                          Expanded(
                            child: Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 4,
                              ),
                              child: _ProviderButton(
                                label: provider.$1,
                                icon: provider.$2,
                                onTap: () => pending(
                                  context,
                                  'Entrada com ${provider.$3}',
                                  'O acesso por ${provider.$3} precisa de PKCE, callback autorizado e migração '
                                      'de sessão validados no servidor. Enquanto não estiver verificado, use o '
                                      'e-mail institucional.',
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: Sg.gapM),
                    Text(
                      'ID da escola e B.I. aguardam o contrato móvel com resolução inequívoca de escola.',
                      textAlign: TextAlign.center,
                      style: Sg.caption.copyWith(color: palette.muted),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _SelectorField extends StatelessWidget {
  const _SelectorField({
    required this.icon,
    required this.label,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final palette = Sg.of(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(Sg.rField),
      child: Container(
        height: Sg.control,
        padding: const EdgeInsets.symmetric(horizontal: Sg.gapM),
        decoration: BoxDecoration(
          color: palette.surface,
          borderRadius: BorderRadius.circular(Sg.rField),
          border: Border.all(color: palette.border),
        ),
        child: Row(
          children: [
            Icon(icon, size: 20, color: palette.muted),
            const SizedBox(width: Sg.gap),
            Expanded(
              child: Text(label, style: Sg.body.copyWith(color: palette.muted)),
            ),
            Icon(Icons.expand_more, size: 20, color: palette.muted),
          ],
        ),
      ),
    );
  }
}

class _ProviderButton extends StatelessWidget {
  const _ProviderButton({
    required this.label,
    required this.icon,
    required this.onTap,
  });
  final String label;
  final IconData icon;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final palette = Sg.of(context);
    return Semantics(
      button: true,
      label: 'Continuar com $label',
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(Sg.rField),
        child: Container(
          height: Sg.control,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(Sg.rField),
            border: Border.all(color: palette.border),
          ),
          alignment: Alignment.center,
          child: Icon(icon, size: 26, color: palette.text),
        ),
      ),
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice(this.message, {this.tone});
  final String message;
  final Color? tone;
  @override
  Widget build(BuildContext context) {
    final palette = Sg.of(context);
    final color = tone ?? palette.muted;
    return Container(
      padding: const EdgeInsets.all(Sg.gap),
      decoration: BoxDecoration(
        color: color.withValues(alpha: .08),
        borderRadius: BorderRadius.circular(Sg.rField),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.info_outline, size: 18, color: color),
          const SizedBox(width: Sg.gapS),
          Expanded(
            child: Text(
              message,
              semanticsLabel: message,
              style: Sg.caption.copyWith(color: color),
            ),
          ),
        ],
      ),
    );
  }
}

/// School picker: active memberships only, with the profile chosen explicitly
/// when a membership carries more than one.
class SchoolsPage extends StatefulWidget {
  const SchoolsPage({
    super.key,
    required this.memberships,
    required this.onSelected,
    required this.onSignOut,
    required this.onRetry,
    this.error,
  });
  final List<Map<String, dynamic>> memberships;
  final void Function(String schoolId, String role) onSelected;
  final VoidCallback onSignOut;
  final VoidCallback onRetry;
  final String? error;
  @override
  State<SchoolsPage> createState() => _SchoolsPageState();
}

class _SchoolsPageState extends State<SchoolsPage> {
  String query = '';
  @override
  Widget build(BuildContext context) {
    final palette = Sg.of(context);
    final active = widget.memberships
        .where((m) => m['active'] == true && m['schoolId'] is String)
        .where((m) => '${m['schoolName']}'.toLowerCase().contains(query))
        .toList();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Seleccione a sua escola'),
        actions: [
          IconButton(
            tooltip: 'Sair',
            onPressed: widget.onSignOut,
            icon: const Icon(Icons.logout_outlined, size: 20),
          ),
          const SizedBox(width: Sg.gapS),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
          Sg.gutter,
          Sg.gapS,
          Sg.gutter,
          Sg.gapL,
        ),
        children: [
          SearchField(
            hint: 'Pesquisar escola…',
            onChanged: (value) =>
                setState(() => query = value.trim().toLowerCase()),
          ),
          const SizedBox(height: Sg.gapM),
          if (widget.error != null)
            StateMessage(
              icon: Icons.cloud_off_outlined,
              message: widget.error!,
              action: 'Tentar novamente',
              onAction: widget.onRetry,
            )
          else ...[
            for (final membership in active)
              Padding(
                padding: const EdgeInsets.only(bottom: Sg.gap),
                child: SigaCard(
                  padding: const EdgeInsets.all(Sg.gap),
                  onTap: () => choose(membership),
                  child: Row(
                    children: [
                      InitialsAvatar('${membership['schoolName']}', size: 46),
                      const SizedBox(width: Sg.gap),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '${membership['schoolName']}',
                              style: Sg.itemTitle.copyWith(color: palette.text),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              roles(membership).map(label).join(', '),
                              style: Sg.caption.copyWith(color: palette.muted),
                            ),
                          ],
                        ),
                      ),
                      Icon(Icons.chevron_right, size: 20, color: palette.muted),
                    ],
                  ),
                ),
              ),
            SigaCard(
              padding: const EdgeInsets.all(Sg.gap),
              color: palette.faint,
              onTap: () => pending(
                context,
                'Pedido de vínculo',
                'O pedido de vínculo é tratado pela secretaria da escola. Este cliente não cria vínculos '
                    'nem consulta contas fora dos seus.',
              ),
              child: Row(
                children: [
                  IconTile(
                    Icons.add_home_work_outlined,
                    color: palette.muted,
                    size: 46,
                  ),
                  const SizedBox(width: Sg.gap),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          active.isEmpty
                              ? 'Sem escola por enquanto'
                              : 'Outra escola',
                          style: Sg.itemTitle.copyWith(color: palette.text),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'Solicitar vínculo',
                          style: Sg.caption.copyWith(color: palette.muted),
                        ),
                      ],
                    ),
                  ),
                  Icon(Icons.chevron_right, size: 20, color: palette.muted),
                ],
              ),
            ),
          ],
          const Footnote(
            'Só aparecem vínculos activos confirmados pelo servidor, com os perfis que a escola autorizou.',
          ),
        ],
      ),
    );
  }

  List<String> roles(Map<String, dynamic> membership) => [
    for (final role in (membership['roles'] as List? ?? []))
      if (role == 'aluno' || role == 'professor') role as String,
  ];
  String label(String role) => role == 'aluno' ? 'Aluno' : 'Professor';
  void choose(Map<String, dynamic> membership) {
    final available = roles(membership);
    final schoolId = membership['schoolId'] as String;
    if (available.isEmpty) return;
    if (available.length == 1) {
      widget.onSelected(schoolId, available.first);
      return;
    }
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheet) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                Sg.gutter,
                0,
                Sg.gutter,
                Sg.gap,
              ),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'Entrar como',
                  style: Sg.section.copyWith(color: Sg.of(sheet).text),
                ),
              ),
            ),
            for (final role in available)
              ListTile(
                leading: IconTile(
                  role == 'aluno'
                      ? Icons.school_outlined
                      : Icons.co_present_outlined,
                  seed: role,
                ),
                title: Text(label(role), style: Sg.itemTitle),
                trailing: const Icon(Icons.chevron_right, size: 20),
                onTap: () {
                  Navigator.of(sheet).pop();
                  widget.onSelected(schoolId, role);
                },
              ),
            const SizedBox(height: Sg.gapM),
          ],
        ),
      ),
    );
  }
}
