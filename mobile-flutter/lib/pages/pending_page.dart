import 'package:flutter/material.dart';
import 'package:fluentui_system_icons/fluentui_system_icons.dart';
import '../design/tokens.dart';
import '../design/widgets.dart';

/// Serviço que ainda não tem integração: diz o que vai ser e porque ainda não
/// está disponível, sem simular que funciona e sem botões sem destino.
class PendingService {
  const PendingService(this.icon, this.title, this.description);
  final IconData icon;
  final String title;
  final String description;
}

const pendingServices = {
  'whatsapp': PendingService(
    FluentIcons.chat_24_regular,
    'WhatsApp',
    'Grupos de turma e convites institucionais. A API oficial do WhatsApp '
        'não permite criar nem gerir grupos automaticamente: a escola regista '
        'o link de convite de cada turma e ele aparece aqui.',
  ),
  'google': PendingService(
    FluentIcons.cloud_24_regular,
    'Google',
    'Calendar, Drive, Gmail, Classroom e Meet da conta institucional, quando '
        'a escola autorizar a ligação (OAuth). Nada é ligado sem essa '
        'autorização.',
  ),
  'library': PendingService(
    FluentIcons.library_24_regular,
    'Biblioteca',
    'Catálogo, empréstimos e devoluções da biblioteca da escola, quando o '
        'módulo estiver activo no SIGA.',
  ),
  'online': PendingService(
    FluentIcons.video_24_regular,
    'Aulas online',
    'Zoom, Google Meet ou BigBlueButton, configurados pela escola por '
        'instituição, turma ou aula. Links e credenciais são geridos pelo '
        'servidor da escola.',
  ),
  'student-only': PendingService(
    FluentIcons.person_search_24_regular,
    'Consulta do aluno',
    'Propinas, recibos, notas publicadas e documentos são consultas do '
        'próprio aluno. Entre com o perfil de aluno para as ver.',
  ),
};

class PendingPage extends StatelessWidget {
  const PendingPage(this.service, {super.key});
  final PendingService service;
  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(Siga.s3),
    children: [
      Row(
        children: [
          IconBadge(service.icon, size: 56),
          const SizedBox(width: Siga.s2),
          const StatusTag('Por activar'),
        ],
      ),
      const SizedBox(height: Siga.s3),
      Text(service.description, style: Theme.of(context).textTheme.bodyLarge),
    ],
  );
}
