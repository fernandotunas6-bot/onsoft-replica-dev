import 'package:flutter/material.dart';
import 'design.dart';

/// One entry of the school services grid. [route] is only set for services
/// this client already serves with a verified contract; everything else opens
/// a preparation page that states what the service still needs.
class SchoolService {
  const SchoolService(
    this.label,
    this.outlined,
    this.rounded, {
    this.route,
    this.detail,
    this.students = true,
    this.teachers = true,
  });
  final String label;
  final IconData outlined;
  final IconData rounded;
  final String? route;
  final String? detail;
  final bool students;
  final bool teachers;
  IconData icon(bool modern) => modern ? rounded : outlined;
}

const schoolServices = <SchoolService>[
  SchoolService(
    'Disciplinas',
    Icons.menu_book_outlined,
    Icons.menu_book_rounded,
    route: '/subjects',
  ),
  SchoolService(
    'Turmas',
    Icons.groups_outlined,
    Icons.groups_rounded,
    route: '/more/classes',
  ),
  SchoolService(
    'Tarefas',
    Icons.assignment_outlined,
    Icons.assignment_rounded,
    route: '/more/tasks',
  ),
  SchoolService(
    'Transporte',
    Icons.directions_bus_outlined,
    Icons.directions_bus_rounded,
    route: '/more/transporte',
  ),
  SchoolService(
    'Aulas online',
    Icons.videocam_outlined,
    Icons.videocam_rounded,
    detail:
        'Zoom, Meet e BigBlueButton exigem credencial válida da escola, sala autorizada e emissão do '
        'convite no servidor. Uma integração configurada não prova acesso ao fornecedor, por isso '
        'nenhum link é apresentado aqui antes dessa verificação.',
  ),
  SchoolService(
    'Calendário',
    Icons.calendar_month_outlined,
    Icons.calendar_month_rounded,
    route: '/calendar',
  ),
  SchoolService(
    'WhatsApp',
    Icons.chat_outlined,
    Icons.chat_rounded,
    detail:
        'O convite do grupo da turma depende do contrato de capacidades por escola e de um link '
        'validado contra a allowlist institucional. Não há criação automática de grupos.',
  ),
  SchoolService(
    'Google',
    Icons.cloud_outlined,
    Icons.cloud_rounded,
    detail:
        'Gmail, Drive, Classroom, Meet e Calendar precisam de OAuth com callback autorizado e prova '
        'recente do fornecedor. A subscrição ICS existente não equivale a sincronização bidireccional.',
  ),
  SchoolService(
    'Propinas',
    Icons.account_balance_wallet_outlined,
    Icons.account_balance_wallet_rounded,
    detail:
        'Propinas, recibos e pagamentos dependem de reconciliação por webhook do provedor. Um '
        'pagamento nunca é dado como confirmado pelo retorno do dispositivo.',
  ),
  SchoolService(
    'Biblioteca',
    Icons.local_library_outlined,
    Icons.local_library_rounded,
    detail:
        'O catálogo da biblioteca ainda não está exposto no contrato móvel autorizado.',
  ),
  SchoolService(
    'Notas',
    Icons.workspace_premium_outlined,
    Icons.workspace_premium_rounded,
    route: '/more/results',
    teachers: false,
    detail:
        'As notas de uma turma dependem de uma avaliação de privacidade por perfil que ainda não '
        'está feita, por isso o perfil professor não as recebe neste cliente.',
  ),
  SchoolService(
    'Faltas',
    Icons.event_busy_outlined,
    Icons.event_busy_rounded,
    detail:
        'A chamada e as presenças exigem MFA, validação de turma e registo de quem marcou. '
        'Um horário publicado não prova presença, por isso nada é inferido do calendário.',
  ),
];

/// Visual preferences the person controls, persisted by the shell.
@immutable
class Appearance {
  const Appearance({
    this.mode = ThemeMode.system,
    this.accent = 0,
    this.wallpaper = 0,
    this.reducedMotion = false,
    this.modernIcons = true,
  });
  final ThemeMode mode;
  final int accent;
  final int wallpaper;
  final bool reducedMotion;
  final bool modernIcons;
  static const accents = [
    Sg.primary,
    Color(0xff8b5cf6),
    Color(0xfff97316),
    Color(0xff10b981),
    Color(0xff8e97a8),
  ];
  static const wallpapers = [
    [Color(0xffeef1ff), Color(0xfff6eeff), Color(0xffffffff)],
    [Color(0xffe9f6ff), Color(0xffeafaf3), Color(0xffffffff)],
    [Color(0xfffdeef7), Color(0xfffff2e6), Color(0xffffffff)],
  ];
  Appearance copyWith({
    ThemeMode? mode,
    int? accent,
    int? wallpaper,
    bool? reducedMotion,
    bool? modernIcons,
  }) => Appearance(
    mode: mode ?? this.mode,
    accent: accent ?? this.accent,
    wallpaper: wallpaper ?? this.wallpaper,
    reducedMotion: reducedMotion ?? this.reducedMotion,
    modernIcons: modernIcons ?? this.modernIcons,
  );
  Color get seed => accents[accent.clamp(0, accents.length - 1)];
}

/// Very light brand wash behind the shell, chosen in Aparência.
class Wallpaper extends StatelessWidget {
  const Wallpaper({super.key, required this.index, required this.child});
  final int index;
  final Widget child;
  @override
  Widget build(BuildContext context) {
    if (Theme.of(context).brightness == Brightness.dark) return child;
    final colors =
        Appearance.wallpapers[index.clamp(0, Appearance.wallpapers.length - 1)];
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: colors,
          begin: Alignment.topLeft,
          end: Alignment.bottomCenter,
          stops: const [0, .35, .75],
        ),
      ),
      child: child,
    );
  }
}

/// «Mais» tab: the school services grid of the approved design.
class ServicesPage extends StatelessWidget {
  const ServicesPage({
    super.key,
    required this.name,
    required this.role,
    required this.schoolName,
    required this.modernIcons,
    required this.onOpen,
    required this.onPreview,
    required this.onAccount,
  });
  final String name;
  final String role;
  final String schoolName;
  final bool modernIcons;
  final void Function(String route) onOpen;
  final void Function(SchoolService service) onPreview;
  final VoidCallback onAccount;

  @override
  Widget build(BuildContext context) {
    final palette = Sg.of(context);
    final services = schoolServices
        .where((s) => role == 'professor' ? s.teachers : s.students)
        .toList();
    return ListView(
      padding: const EdgeInsets.fromLTRB(
        Sg.gutter,
        Sg.gapS,
        Sg.gutter,
        Sg.gapL,
      ),
      children: [
        SigaCard(
          padding: const EdgeInsets.all(Sg.gapM),
          onTap: onAccount,
          child: Row(
            children: [
              InitialsAvatar(name, size: 48, gradient: true),
              const SizedBox(width: Sg.gap),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name.isEmpty ? 'A sua conta' : name,
                      style: Sg.itemTitle.copyWith(color: palette.text),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${role == 'professor' ? 'Professor' : 'Aluno'} · $schoolName',
                      style: Sg.caption.copyWith(color: palette.muted),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right, size: 20, color: palette.muted),
            ],
          ),
        ),
        const SizedBox(height: Sg.gapL),
        Text(
          'SIGA Plus · Escola activa',
          style: Sg.caption.copyWith(color: palette.muted),
        ),
        const SizedBox(height: Sg.gapXs),
        Text(
          'Serviços escolares',
          style: Sg.title.copyWith(color: palette.text),
        ),
        const SizedBox(height: Sg.gapM),
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: services.length,
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 3,
            mainAxisSpacing: Sg.gap,
            crossAxisSpacing: Sg.gap,
            childAspectRatio: .98,
          ),
          itemBuilder: (context, index) {
            final service = services[index];
            return _ServiceTile(
              service: service,
              modernIcons: modernIcons,
              onTap: () => service.route != null
                  ? onOpen(service.route!)
                  : onPreview(service),
            );
          },
        ),
        const Footnote(
          'Cada serviço abre uma página própria. Os que ainda não têm contrato verificado abrem a '
          'página de preparação, em vez de um atalho sem destino.',
        ),
      ],
    );
  }
}

class _ServiceTile extends StatelessWidget {
  const _ServiceTile({
    required this.service,
    required this.modernIcons,
    required this.onTap,
  });
  final SchoolService service;
  final bool modernIcons;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final palette = Sg.of(context);
    return Material(
      color: palette.surface,
      borderRadius: BorderRadius.circular(Sg.rCard),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(Sg.rCard),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(service.icon(modernIcons), size: 26, color: palette.text),
            const SizedBox(height: Sg.gap),
            Text(
              service.label,
              textAlign: TextAlign.center,
              style: Sg.caption.copyWith(
                fontWeight: FontWeight.w600,
                color: palette.text,
              ),
            ),
            if (service.route == null)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(
                  'em preparação',
                  style: Sg.tiny.copyWith(fontSize: 9.5, color: palette.muted),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Account menu of the approved design, as a sheet over the shell.
class AccountSheet extends StatelessWidget {
  const AccountSheet({
    super.key,
    required this.name,
    required this.role,
    required this.className,
    required this.dark,
    required this.onDark,
    required this.onOpen,
    required this.onPreview,
    required this.onAppearance,
    required this.onSwitchSchool,
    required this.onSignOut,
  });
  final String name;
  final String role;
  final String className;
  final bool dark;
  final ValueChanged<bool> onDark;
  final void Function(String route) onOpen;
  final void Function(SchoolService service) onPreview;
  final VoidCallback onAppearance;
  final VoidCallback onSwitchSchool;
  final VoidCallback onSignOut;

  SchoolService service(String label) =>
      schoolServices.firstWhere((s) => s.label == label);

  @override
  Widget build(BuildContext context) {
    final palette = Sg.of(context);
    final student = role != 'professor';
    final entries = <SchoolService>[
      if (student) service('Notas'),
      service('Faltas'),
      service('Propinas'),
      service('Biblioteca'),
    ];
    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
              Sg.gutter,
              0,
              Sg.gutter,
              Sg.gapM,
            ),
            child: Row(
              children: [
                InitialsAvatar(name, size: 46, gradient: true),
                const SizedBox(width: Sg.gap),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        name.isEmpty ? 'A sua conta' : name,
                        style: Sg.itemTitle.copyWith(color: palette.text),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        [
                          student ? 'Aluno' : 'Professor',
                          if (className.isNotEmpty) className,
                        ].join(' · '),
                        style: Sg.caption.copyWith(color: palette.muted),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Divider(color: palette.border),
          Flexible(
            child: ListView(
              shrinkWrap: true,
              padding: const EdgeInsets.symmetric(
                horizontal: Sg.gap,
                vertical: Sg.gapS,
              ),
              children: [
                for (final entry in entries)
                  SigaRow(
                    leading: IconTile(
                      entry.outlined,
                      seed: entry.label,
                      size: 38,
                    ),
                    title: entry.label,
                    subtitle: entry.route == null ? 'Em preparação' : null,
                    onTap: () {
                      Navigator.of(context).pop();
                      entry.route != null
                          ? onOpen(entry.route!)
                          : onPreview(entry);
                    },
                  ),
                SigaRow(
                  leading: const IconTile(
                    Icons.palette_outlined,
                    seed: 'aparencia',
                    size: 38,
                  ),
                  title: 'Aparência',
                  onTap: () {
                    Navigator.of(context).pop();
                    onAppearance();
                  },
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(
                    vertical: Sg.gapXs,
                    horizontal: Sg.gapS,
                  ),
                  child: Row(
                    children: [
                      const IconTile(
                        Icons.dark_mode_outlined,
                        seed: 'escuro',
                        size: 38,
                      ),
                      const SizedBox(width: Sg.gap),
                      Expanded(
                        child: Text(
                          'Modo escuro',
                          style: Sg.itemTitle.copyWith(color: palette.text),
                        ),
                      ),
                      Switch(value: dark, onChanged: onDark),
                    ],
                  ),
                ),
                Divider(color: palette.border),
                SigaRow(
                  leading: IconTile(
                    Icons.logout_outlined,
                    color: Sg.danger,
                    size: 38,
                  ),
                  chevron: false,
                  title: 'Sair',
                  onTap: () {
                    Navigator.of(context).pop();
                    onSignOut();
                  },
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Aparência: theme, wallpaper, accent colour and motion.
class AppearancePage extends StatelessWidget {
  const AppearancePage({
    super.key,
    required this.value,
    required this.onChanged,
    required this.onBack,
  });
  final Appearance value;
  final ValueChanged<Appearance> onChanged;
  final VoidCallback onBack;
  @override
  Widget build(BuildContext context) {
    final palette = Sg.of(context);
    final primary = Theme.of(context).colorScheme.primary;
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          onPressed: onBack,
          icon: const Icon(Icons.arrow_back),
          tooltip: 'Voltar',
        ),
        title: const Text('Aparência'),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
          Sg.gutter,
          Sg.gapS,
          Sg.gutter,
          Sg.gapL,
        ),
        children: [
          Text('Tema', style: Sg.section.copyWith(color: palette.text)),
          const SizedBox(height: Sg.gap),
          Row(
            children: [
              for (final option in const [
                (ThemeMode.system, 'Sistema', Icons.computer_outlined),
                (ThemeMode.light, 'Claro', Icons.wb_sunny_outlined),
                (ThemeMode.dark, 'Escuro', Icons.nightlight_outlined),
              ])
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(right: Sg.gapS),
                    child: _ThemeCard(
                      label: option.$2,
                      icon: option.$3,
                      selected: value.mode == option.$1,
                      onTap: () => onChanged(value.copyWith(mode: option.$1)),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: Sg.gapL),
          Text(
            'Plano de fundo do painel',
            style: Sg.section.copyWith(color: palette.text),
          ),
          const SizedBox(height: Sg.gap),
          Row(
            children: [
              for (var i = 0; i < Appearance.wallpapers.length; i++)
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(right: Sg.gapS),
                    child: InkWell(
                      onTap: () => onChanged(value.copyWith(wallpaper: i)),
                      borderRadius: BorderRadius.circular(Sg.rCard),
                      child: Container(
                        height: 74,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(Sg.rCard),
                          gradient: LinearGradient(
                            colors: Appearance.wallpapers[i],
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                          ),
                          border: Border.all(
                            color: value.wallpaper == i
                                ? primary
                                : palette.border,
                            width: value.wallpaper == i ? 2 : 1,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: Sg.gapL),
          Text(
            'Cor principal',
            style: Sg.section.copyWith(color: palette.text),
          ),
          const SizedBox(height: Sg.gap),
          Row(
            children: [
              for (var i = 0; i < Appearance.accents.length; i++)
                Padding(
                  padding: const EdgeInsets.only(right: Sg.gap),
                  child: Semantics(
                    button: true,
                    selected: value.accent == i,
                    label: 'Cor ${i + 1}',
                    child: InkWell(
                      onTap: () => onChanged(value.copyWith(accent: i)),
                      customBorder: const CircleBorder(),
                      child: Container(
                        width: 38,
                        height: 38,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: Appearance.accents[i],
                          border: Border.all(
                            color: value.accent == i
                                ? palette.text
                                : Colors.transparent,
                            width: 2,
                          ),
                        ),
                        child: value.accent == i
                            ? const Icon(
                                Icons.check,
                                size: 18,
                                color: Colors.white,
                              )
                            : null,
                      ),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: Sg.gapL),
          _SwitchRow(
            icon: Icons.animation_outlined,
            title: 'Reduzir movimentos',
            subtitle: 'Animações mais suaves.',
            value: value.reducedMotion,
            onChanged: (on) => onChanged(value.copyWith(reducedMotion: on)),
          ),
          const SizedBox(height: Sg.gap),
          _SwitchRow(
            icon: Icons.auto_awesome_outlined,
            title: 'Utilizar ícones modernos',
            subtitle: 'Estilo 2026.',
            value: value.modernIcons,
            onChanged: (on) => onChanged(value.copyWith(modernIcons: on)),
          ),
          const Footnote(
            'As preferências ficam neste dispositivo. Não alteram as definições da escola nem o seu perfil.',
          ),
        ],
      ),
    );
  }
}

class _ThemeCard extends StatelessWidget {
  const _ThemeCard({
    required this.label,
    required this.icon,
    required this.selected,
    required this.onTap,
  });
  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final palette = Sg.of(context);
    final primary = Theme.of(context).colorScheme.primary;
    return Semantics(
      button: true,
      selected: selected,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(Sg.rCard),
        child: Container(
          height: 92,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(Sg.rCard),
            border: Border.all(
              color: selected ? primary : palette.border,
              width: selected ? 2 : 1,
            ),
            color: selected ? primary.withValues(alpha: .06) : palette.canvas,
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 24, color: selected ? primary : palette.muted),
              const SizedBox(height: Sg.gapS),
              Text(
                label,
                style: Sg.caption.copyWith(
                  fontWeight: FontWeight.w600,
                  color: selected ? primary : palette.text,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SwitchRow extends StatelessWidget {
  const _SwitchRow({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.value,
    required this.onChanged,
  });
  final IconData icon;
  final String title;
  final String subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;
  @override
  Widget build(BuildContext context) {
    final palette = Sg.of(context);
    return Row(
      children: [
        IconTile(icon, seed: title, size: 38),
        const SizedBox(width: Sg.gap),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: Sg.itemTitle.copyWith(color: palette.text)),
              const SizedBox(height: 2),
              Text(subtitle, style: Sg.caption.copyWith(color: palette.muted)),
            ],
          ),
        ),
        Switch(value: value, onChanged: onChanged),
      ],
    );
  }
}

/// Page for a service of the approved design that has no verified contract in
/// this client yet. It states the requirement instead of showing example data.
class ServicePreviewPage extends StatelessWidget {
  const ServicePreviewPage({
    super.key,
    required this.service,
    required this.onBack,
    required this.modernIcons,
  });
  final SchoolService service;
  final VoidCallback onBack;
  final bool modernIcons;
  @override
  Widget build(BuildContext context) {
    final palette = Sg.of(context);
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          onPressed: onBack,
          icon: const Icon(Icons.arrow_back),
          tooltip: 'Voltar',
        ),
        title: Text(service.label),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
          Sg.gutter,
          Sg.gapS,
          Sg.gutter,
          Sg.gapL,
        ),
        children: [
          SigaCard(
            padding: const EdgeInsets.all(Sg.gapM),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    IconTile(
                      service.icon(modernIcons),
                      seed: service.label,
                      size: 46,
                    ),
                    const SizedBox(width: Sg.gap),
                    Expanded(
                      child: Text(
                        service.label,
                        style: Sg.section.copyWith(
                          fontSize: 19,
                          color: palette.text,
                        ),
                      ),
                    ),
                    const StateBadge('Em preparação'),
                  ],
                ),
                const SizedBox(height: Sg.gapM),
                Text(
                  service.detail ??
                      'Este serviço ainda não tem contrato móvel verificado.',
                  style: Sg.body.copyWith(color: palette.muted),
                ),
              ],
            ),
          ),
          const SizedBox(height: Sg.gapM),
          Text(
            'Antes de abrir este serviço',
            style: Sg.section.copyWith(color: palette.text),
          ),
          const SizedBox(height: Sg.gapS),
          for (final step in const [
            'Contrato versionado com guardas de sessão, escola e perfil no servidor.',
            'Prova recente do fornecedor ou do módulo da escola, não apenas configuração guardada.',
            'Testes de origem, autorização e âmbito antes de qualquer dado real aparecer aqui.',
          ])
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    Icons.check_circle_outline,
                    size: 18,
                    color: palette.muted,
                  ),
                  const SizedBox(width: Sg.gapS),
                  Expanded(
                    child: Text(
                      step,
                      style: Sg.caption.copyWith(color: palette.muted),
                    ),
                  ),
                ],
              ),
            ),
          const Footnote(
            'Nenhum dado de exemplo é apresentado como se fosse da sua escola.',
          ),
        ],
      ),
    );
  }
}

/// Transport concept page, reproduced from the approved design and explicitly
/// marked as a simulation: no GPS position is read, stored or animated.
class TransportPage extends StatelessWidget {
  const TransportPage({super.key, required this.onBack});
  final VoidCallback onBack;
  @override
  Widget build(BuildContext context) {
    final palette = Sg.of(context);
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          onPressed: onBack,
          icon: const Icon(Icons.arrow_back),
          tooltip: 'Voltar',
        ),
        title: const Text('Transporte'),
        actions: const [
          StateBadge('Conceito'),
          SizedBox(width: Sg.gutter),
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
          SigaCard(
            padding: const EdgeInsets.all(Sg.gapM),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const IconTile(
                      Icons.directions_bus_outlined,
                      seed: 'transporte',
                      size: 46,
                    ),
                    const SizedBox(width: Sg.gap),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Rota escolar 01',
                            style: Sg.section.copyWith(
                              fontSize: 19,
                              color: palette.text,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            'Acompanhamento do percurso',
                            style: Sg.caption.copyWith(color: palette.muted),
                          ),
                        ],
                      ),
                    ),
                    const StateBadge('Simulação'),
                  ],
                ),
                const SizedBox(height: Sg.gapM),
                Container(
                  decoration: BoxDecoration(
                    color: palette.surface,
                    borderRadius: BorderRadius.circular(Sg.rTile),
                  ),
                  padding: const EdgeInsets.all(Sg.gapM),
                  child: Column(
                    children: [
                      SizedBox(
                        height: 150,
                        child: CustomPaint(
                          size: Size.infinite,
                          painter: _RoutePainter(
                            line: Theme.of(context).colorScheme.primary,
                            grid: palette.border,
                            done: const Color(0xff10b981),
                            muted: palette.muted,
                          ),
                          child: Semantics(
                            label:
                                'Trajecto ilustrativo entre a paragem inicial e a paragem final',
                            child: const SizedBox.expand(),
                          ),
                        ),
                      ),
                      const SizedBox(height: Sg.gapS),
                      Text(
                        'Trajecto ilustrativo, sem localização GPS real',
                        style: Sg.caption.copyWith(color: palette.muted),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: Sg.gap),
                Row(
                  children: [
                    Expanded(
                      child: _Metric(
                        label: 'Próxima paragem',
                        value: 'Paragem B',
                      ),
                    ),
                    const SizedBox(width: Sg.gap),
                    Expanded(
                      child: _Metric(label: 'Estado', value: 'A aguardar GPS'),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: Sg.gapM),
          Text(
            'O que o módulo exige',
            style: Sg.section.copyWith(color: palette.text),
          ),
          const SizedBox(height: Sg.gapS),
          for (final item in const [
            (
              'Rotas, paragens, veículos e motoristas',
              Icons.alt_route_outlined,
            ),
            (
              'Alunos autorizados por vínculo, nunca por nome ou telefone',
              Icons.verified_user_outlined,
            ),
            (
              'Embarque registado por evento, nunca deduzido de proximidade',
              Icons.how_to_reg_outlined,
            ),
            (
              'Ingestão autenticada por dispositivo, com retenção curta',
              Icons.sensors_outlined,
            ),
          ])
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(
                children: [
                  IconTile(item.$2, seed: item.$1, size: 38),
                  const SizedBox(width: Sg.gap),
                  Expanded(
                    child: Text(
                      item.$1,
                      style: Sg.caption.copyWith(color: palette.muted),
                    ),
                  ),
                ],
              ),
            ),
          const Footnote(
            'A localização real só estará disponível após autorização, integração GPS e activação da rota. '
            'Esta página não lê nem guarda coordenadas.',
          ),
        ],
      ),
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric({required this.label, required this.value});
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) {
    final palette = Sg.of(context);
    return Container(
      padding: const EdgeInsets.all(Sg.gapM),
      decoration: BoxDecoration(
        color: palette.surface,
        borderRadius: BorderRadius.circular(Sg.rTile),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: Sg.caption.copyWith(color: palette.muted)),
          const SizedBox(height: Sg.gapXs),
          Text(value, style: Sg.itemTitle.copyWith(color: palette.text)),
        ],
      ),
    );
  }
}

class _RoutePainter extends CustomPainter {
  _RoutePainter({
    required this.line,
    required this.grid,
    required this.done,
    required this.muted,
  });
  final Color line;
  final Color grid;
  final Color done;
  final Color muted;
  @override
  void paint(Canvas canvas, Size size) {
    final gridPaint = Paint()
      ..color = grid
      ..strokeWidth = 1;
    for (var i = 1; i < 4; i++) {
      final y = size.height / 4 * i;
      canvas.drawLine(Offset(0, y), Offset(size.width, y), gridPaint);
    }
    for (var i = 1; i < 5; i++) {
      final x = size.width / 5 * i;
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), gridPaint);
    }
    final start = Offset(size.width * .08, size.height * .80);
    final bus = Offset(size.width * .46, size.height * .52);
    final end = Offset(size.width * .92, size.height * .22);
    final travelled = Path()
      ..moveTo(start.dx, start.dy)
      ..cubicTo(
        size.width * .20,
        size.height * .40,
        size.width * .30,
        size.height * .38,
        bus.dx,
        bus.dy,
      );
    canvas.drawPath(
      travelled,
      Paint()
        ..color = line
        ..style = PaintingStyle.stroke
        ..strokeWidth = 4
        ..strokeCap = StrokeCap.round,
    );
    final remaining = Path()
      ..moveTo(bus.dx, bus.dy)
      ..cubicTo(
        size.width * .62,
        size.height * .62,
        size.width * .70,
        size.height * .10,
        end.dx,
        end.dy,
      );
    final dash = Paint()
      ..color = muted.withValues(alpha: .55)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4
      ..strokeCap = StrokeCap.round;
    for (final metric in remaining.computeMetrics()) {
      var distance = 0.0;
      while (distance < metric.length) {
        final next = (distance + 10).clamp(0.0, metric.length);
        canvas.drawPath(metric.extractPath(distance, next), dash);
        distance = next + 8;
      }
    }
    canvas.drawCircle(start, 7, Paint()..color = muted.withValues(alpha: .6));
    canvas.drawCircle(end, 7, Paint()..color = done);
    canvas.drawCircle(bus, 13, Paint()..color = line.withValues(alpha: .18));
    canvas.drawCircle(bus, 7, Paint()..color = line);
    canvas.drawCircle(bus, 3, Paint()..color = Colors.white);
  }

  @override
  bool shouldRepaint(_RoutePainter old) => old.line != line || old.grid != grid;
}
