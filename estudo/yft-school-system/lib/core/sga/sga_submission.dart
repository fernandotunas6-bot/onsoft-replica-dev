import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import 'sga_work.dart';

/// O mesmo limite do portal (`MAX_ATTACHMENT_BYTES`): 5 MB por anexo.
const int maxAttachmentBytes = 5 * 1024 * 1024;

/// Páginas por entrega: com fotos reduzidas (≈ 300 KB) cabem bem nos 5 MB.
const int maxSubmissionPages = 10;

/// O tipo de uma imagem pelos primeiros bytes (o portal confirma da mesma forma);
/// null quando não é JPG, PNG nem WebP.
String? imageTypeOf(Uint8List bytes) {
  bool at(List<int> sig, [int offset = 0]) {
    if (bytes.length < offset + sig.length) return false;
    for (var i = 0; i < sig.length; i++) {
      if (bytes[offset + i] != sig[i]) return false;
    }
    return true;
  }

  if (at(const [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (at(const [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }
  if (at(ascii.encode('RIFF')) && at(ascii.encode('WEBP'), 8)) {
    return 'image/webp';
  }
  return null;
}

const _extensions = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/// Nome do ficheiro a partir do título do trabalho: só letras, números e
/// hífenes, até 60 caracteres (o portal volta a limpar e põe a extensão do tipo).
String attachmentName(String title, String contentType) {
  final base = title
      .toLowerCase()
      .replaceAll(RegExp(r'[^a-z0-9à-ÿ]+'), '-')
      .replaceAll(RegExp(r'^-+|-+$'), '');
  final cut = base.length > 60 ? base.substring(0, 60) : base;
  return '${cut.isEmpty ? 'trabalho' : cut}.${_extensions[contentType] ?? 'bin'}';
}

/// O anexo de uma entrega, pronto a enviar.
class WorkAttachment {
  final String name;
  final String contentType;
  final Uint8List bytes;

  const WorkAttachment({
    required this.name,
    required this.contentType,
    required this.bytes,
  });

  Map<String, dynamic> toJson() => {
    'name': name,
    'contentType': contentType,
    'base64': base64Encode(bytes),
  };
}

/// Recusa da app antes de enviar (o texto é para a pessoa).
class SubmissionException implements Exception {
  final String message;
  const SubmissionException(this.message);

  @override
  String toString() => message;
}

/// As páginas fotografadas num só anexo: uma foto segue como está; várias
/// juntam-se num PDF, uma por página A4, sem margens a mais.
Future<WorkAttachment?> buildAttachment(
  List<Uint8List> pages, {
  required String title,
}) async {
  if (pages.isEmpty) return null;
  for (final p in pages) {
    final type = imageTypeOf(p);
    if (type == null || (pages.length > 1 && type == 'image/webp')) {
      throw const SubmissionException(
        'Esta imagem não serve: use fotos em JPG ou PNG.',
      );
    }
  }
  final WorkAttachment attachment;
  if (pages.length == 1) {
    final type = imageTypeOf(pages.first)!;
    attachment = WorkAttachment(
      name: attachmentName(title, type),
      contentType: type,
      bytes: pages.first,
    );
  } else {
    final doc = pw.Document(title: title, creator: 'SIGA Plus');
    for (final p in pages) {
      final image = pw.MemoryImage(p);
      doc.addPage(
        pw.Page(
          pageFormat: PdfPageFormat.a4,
          margin: const pw.EdgeInsets.all(16),
          build: (_) =>
              pw.Center(child: pw.Image(image, fit: pw.BoxFit.contain)),
        ),
      );
    }
    attachment = WorkAttachment(
      name: attachmentName(title, 'application/pdf'),
      contentType: 'application/pdf',
      bytes: await doc.save(),
    );
  }
  if (attachment.bytes.length > maxAttachmentBytes) {
    throw const SubmissionException(
      'O trabalho passa de 5 MB. Tire menos fotos ou fotografe mais de perto.',
    );
  }
  return attachment;
}

/// O aluno ainda pode entregar (ou reenviar, até o professor devolver)?
/// O portal decide no fim (prazo, atrasos, tarefa fechada); isto só esconde o
/// botão quando já se sabe que não dá.
bool canSubmitTask(WorkTask task) =>
    !task.archived &&
    (task.state == WorkState.open ||
        task.state == WorkState.overdue ||
        (task.state == WorkState.submitted && !task.onPaper));

/// Resultado de uma entrega aceite.
class SubmissionResult {
  final int attempt;
  final bool late;
  const SubmissionResult({required this.attempt, required this.late});
}

/// Entrega pela rota do portal (`POST /api/mobile/work`, a função
/// `submitTaskWork` do SIGA).
Future<SubmissionResult> submitWork(
  Dio portal, {
  required String taskId,
  String? body,
  WorkAttachment? attachment,
}) async {
  final text = body?.trim() ?? '';
  if (text.isEmpty && attachment == null) {
    throw const SubmissionException(
      'Escreva a resposta ou junte as fotos do trabalho.',
    );
  }
  final res = await portal.post(
    '/api/mobile/work',
    data: {
      'action': 'submit',
      'taskId': taskId,
      if (text.isNotEmpty) 'body': text,
      if (attachment != null) 'attachment': attachment.toJson(),
    },
    // Fotos em rede lenta: dar tempo ao envio.
    options: Options(sendTimeout: const Duration(minutes: 3)),
  );
  final data = res.data is Map<String, dynamic>
      ? res.data as Map<String, dynamic>
      : const <String, dynamic>{};
  return SubmissionResult(
    attempt: (data['attempt'] as num?)?.toInt() ?? 1,
    late: data['late'] == true,
  );
}

/// O texto a mostrar quando a entrega falha.
String submissionErrorMessage(Object error) {
  if (error is SubmissionException) return error.message;
  if (error is DioException) {
    final data = error.response?.data;
    if (data is Map && data['message'] is String) {
      return data['message'] as String;
    }
    return switch (error.type) {
      DioExceptionType.connectionError ||
      DioExceptionType.connectionTimeout ||
      DioExceptionType.sendTimeout ||
      DioExceptionType.receiveTimeout =>
        'Sem rede: o trabalho não foi entregue. As fotos ficam aqui; tente de novo.',
      _ =>
        error.response?.statusCode == 401
            ? 'A sessão terminou. Entre de novo e repita a entrega.'
            : 'Não foi possível entregar o trabalho. Tente de novo.',
    };
  }
  return 'Não foi possível entregar o trabalho. Tente de novo.';
}
