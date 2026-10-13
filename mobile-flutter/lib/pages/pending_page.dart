import 'package:flutter/material.dart';
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
    Icons.chat_bubble_outline,
    'WhatsApp',
    'Grupos de turma e convites institucionais. A API oficial do WhatsApp '
        'não permite criar nem gerir grupos automaticamente: a escola regista '
        'o link de convite de cada turma e ele aparece aqui.',
  ),
  'google': PendingService(
    Icons.cloud_outlined,
    'Google',
    'Calendar, Drive, Gmail, Classroom e Meet da conta institucional, quando '
        'a escola autorizar a ligação (OAuth). Nada é ligado sem essa '
        'autorização.',
  ),
  'library': PendingService(
    Icons.local_library_outlined,
    'Biblioteca',
    'Catálogo, empréstimos e devoluções da biblioteca da escola, quando o '
        'módulo estiver activo no SIGA.',
  ),
  'online': PendingService(
    Icons.videocam_outlined,
    'Aulas online',
    'Zoom, Google Meet ou BigBlueButton, configurados pela escola por '
        'instituição, turma ou aula. Links e credenciais são geridos pelo '
        'servidor da escola.',
  ),
  'absences': PendingService(
    Icons.event_busy_outlined,
    'Faltas',
    'As presenças e faltas registadas pela escola, só para quem tem '
        'permissão, quando o contrato de presenças estiver ligado a esta app.',
  ),
  'student-only': PendingService(
    Icons.person_search_outlined,
    'Consulta do aluno',
    'Propinas, recibos, notas publicadas e documentos são consultas do '
        'próprio aluno. Entre com o perfil de aluno para as ver.',
  ),
  'profile': PendingService(
    Icons.person_outline,
    'Meu perfil',
    'Os dados pessoais são geridos pela secretaria da escola. A edição do '
        'perfil nesta app ainda não está disponível.',
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
