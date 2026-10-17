import 'package:flutter/material.dart';
import 'package:fluentui_system_icons/fluentui_system_icons.dart';
import 'package:url_launcher/url_launcher.dart';
import 'tokens.dart';
import 'widgets.dart';

/// A app é para a rotina; o trabalho complexo faz-se no portal SIGA Plus web
/// ou no aplicativo desktop. Este ficheiro reúne essa fronteira: o endereço
/// do portal, o botão que o abre e o que, em cada perfil, fica lá.

/// Endereço do portal SIGA Plus web (do `.env`); null na demonstração ou
/// sem configuração.
class PortalScope extends InheritedWidget {
  const PortalScope({super.key, required this.url, required super.child});
  final Uri? url;

  static Uri? urlOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<PortalScope>()?.url;

  @override
  bool updateShouldNotify(PortalScope old) => old.url != url;
}

/// Abre o portal no navegador; sem endereço ou sem navegador, explica.
Future<void> openPortal(BuildContext context) async {
  final url = PortalScope.urlOf(context);
  final messenger = ScaffoldMessenger.maybeOf(context);
  void say(String text) =>
      messenger?.showSnackBar(SnackBar(content: Text(text)));
  if (url == null) {
    say(
      'Abra o portal SIGA Plus web ou o aplicativo desktop da sua escola '
      'para esta tarefa.',
    );
    return;
  }
  try {
    final opened = await launchUrl(url, mode: LaunchMode.externalApplication);
    if (!opened) say('Não foi possível abrir ${url.host}.');
  } catch (_) {
    say('Não foi possível abrir ${url.host}.');
  }
}

/// Uma tarefa que se faz no portal (ou no desktop), não na app.
class PortalTask {
  const PortalTask(this.icon, this.title, this.description);
  final IconData icon;
  final String title;
  final String description;
}

/// O que cada perfil faz no portal. A app consulta estes dados, mas não os
/// cria nem altera: são operações longas, com regras e validações da
/// secretaria, melhor feitas num ecrã grande.
List<PortalTask> portalTasks({required bool student}) => student
    ? const [
        PortalTask(
          FluentIcons.document_add_24_regular,
          'Pedir documentos',
          'Declarações, certificados e históricos pedem-se no portal; aqui '
              'acompanha o estado de cada pedido.',
        ),
        PortalTask(
          FluentIcons.payment_24_regular,
          'Pagar propinas',
          'Pagamentos e referências são tratados no portal (Payflow) ou na '
              'tesouraria; aqui consulta facturas e recibos.',
        ),
        PortalTask(
          FluentIcons.arrow_upload_24_regular,
          'Entregar trabalhos com ficheiros',
          'Entregas com anexos fazem-se no portal; aqui vê as tarefas e os '
              'prazos.',
        ),
        PortalTask(
          FluentIcons.person_edit_24_regular,
          'Corrigir dados pessoais',
          'Nome, contactos e matrícula são actualizados pela secretaria.',
        ),
      ]
    : const [
        PortalTask(
          FluentIcons.table_edit_24_regular,
          'Lançar e alterar notas',
          'Lançamento de notas, submissão e fecho de pautas fazem-se no '
              'portal; aqui consulta as pautas.',
        ),
        PortalTask(
          FluentIcons.notebook_add_24_regular,
          'Criar e editar planos de aula',
          'Planos, componentes de avaliação e anexos editam-se no portal; '
              'aqui consulta-os.',
        ),
        PortalTask(
          FluentIcons.task_list_add_24_regular,
          'Criar tarefas para a turma',
          'Tarefas, instruções e prazos publicam-se no portal; aqui vê as '
              'que estão publicadas.',
        ),
        PortalTask(
          FluentIcons.calendar_edit_24_regular,
          'Corrigir chamadas fechadas',
          'Na app faz a chamada do dia e as que ficaram por fechar; '
              'correcções a chamadas fechadas fazem-se no portal.',
        ),
      ];

/// Folha com a explicação de uma tarefa do portal e o botão para o abrir.
void showPortalTask(BuildContext context, PortalTask task) =>
    showSigaSheet<void>(
      context,
      title: task.title,
      builder: (sheet) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(task.description, style: const TextStyle(height: 1.45)),
          const SizedBox(height: Siga.s1),
          Text(
            'Também disponível no aplicativo desktop SIGA Plus.',
            style: TextStyle(fontSize: 12, color: SigaPalette.of(sheet).ink2),
          ),
          const SizedBox(height: Siga.s2),
          FilledButton.icon(
            onPressed: () {
              Navigator.of(sheet).pop();
              openPortal(context);
            },
            icon: const Icon(FluentIcons.open_24_regular, size: 18),
            label: const Text('Abrir o portal SIGA Plus'),
          ),
        ],
      ),
    );

/// Linha «faz-se no portal» no fim de uma página de consulta, com o botão.
class PortalHint extends StatelessWidget {
  const PortalHint(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) {
    final palette = SigaPalette.of(context);
    return Container(
      margin: const EdgeInsets.only(top: Siga.s2),
      padding: const EdgeInsets.fromLTRB(14, 12, 6, 12),
      decoration: BoxDecoration(
        color: palette.surface2,
        borderRadius: BorderRadius.circular(Siga.rMedium),
      ),
      child: Row(
        children: [
          Icon(FluentIcons.desktop_24_regular, size: 20, color: palette.ink2),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                fontSize: 12.5,
                color: palette.ink2,
                height: 1.35,
              ),
            ),
          ),
          TextButton(
            onPressed: () => openPortal(context),
            child: const Text('Portal'),
          ),
        ],
      ),
    );
  }
}
