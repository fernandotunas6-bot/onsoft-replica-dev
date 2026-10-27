import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:yft_school_system/core/sga/sga_attendance.dart'
    show sgaPortalDioProvider;
import 'package:yft_school_system/core/sga/sga_submission.dart';
import 'package:yft_school_system/core/sga/sga_work.dart';
import 'package:yft_school_system/core/theme/app_theme.dart';
import 'package:yft_school_system/features/work/presentation/submit_work_screen.dart';

/// PNG de 1×1 válido (o PDF descodifica-o).
final _png = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
);
final _jpeg = Uint8List.fromList([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
final _webp = Uint8List.fromList([
  ...ascii.encode('RIFF'),
  0,
  0,
  0,
  0,
  ...ascii.encode('WEBP'),
]);

class _Portal implements HttpClientAdapter {
  final List<RequestOptions> requests = [];
  (int, Object) Function(RequestOptions) reply;
  _Portal(this.reply);

  @override
  Future<ResponseBody> fetch(
    RequestOptions o,
    Stream<Uint8List>? s,
    Future<void>? c,
  ) async {
    requests.add(o);
    final (status, body) = reply(o);
    return ResponseBody.fromString(
      jsonEncode(body),
      status,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

Dio _dio(_Portal p) =>
    Dio(BaseOptions(baseUrl: 'https://portal.test'))..httpClientAdapter = p;

WorkTask _task({
  WorkState state = WorkState.open,
  bool archived = false,
  bool onPaper = false,
  int attempt = 0,
}) => WorkTask(
  id: '00000000-0000-0000-0000-0000000000d1',
  title: 'Relatório de laboratório',
  kind: 'trabalho',
  subjectName: 'Física',
  state: state,
  archived: archived,
  onPaper: onPaper,
  attempt: attempt,
);

void main() {
  group('anexo', () {
    test('tipo pelos primeiros bytes, como o portal', () {
      expect(imageTypeOf(_jpeg), 'image/jpeg');
      expect(imageTypeOf(Uint8List.fromList(_png)), 'image/png');
      expect(imageTypeOf(_webp), 'image/webp');
      expect(imageTypeOf(Uint8List.fromList(ascii.encode('%PDF-1.4'))), null);
      expect(imageTypeOf(Uint8List(2)), null);
    });

    test('nome a partir do título, com a extensão do tipo', () {
      expect(
        attachmentName('Relatório de laboratório!', 'application/pdf'),
        'relatório-de-laboratório.pdf',
      );
      expect(attachmentName('???', 'image/jpeg'), 'trabalho.jpg');
      expect(attachmentName('a' * 80, 'image/png'), '${'a' * 60}.png');
    });

    test('uma foto segue como está', () async {
      final a = await buildAttachment([_jpeg], title: 'Ficha');
      expect(a!.contentType, 'image/jpeg');
      expect(a.bytes, _jpeg);
      expect(a.name, 'ficha.jpg');
      expect(a.toJson()['base64'], base64Encode(_jpeg));
    });

    test('várias fotos juntam-se num PDF', () async {
      final a = await buildAttachment([_png, _png], title: 'Ficha');
      expect(a!.contentType, 'application/pdf');
      expect(ascii.decode(a.bytes.sublist(0, 5)), '%PDF-');
      expect(a.name, 'ficha.pdf');
    });

    test('sem fotos não há anexo', () async {
      expect(await buildAttachment(const [], title: 'x'), isNull);
    });

    test(
      'recusa imagens que o portal não aceita e anexos acima de 5 MB',
      () async {
        await expectLater(
          buildAttachment([
            Uint8List.fromList(ascii.encode('GIF89a')),
          ], title: 'x'),
          throwsA(isA<SubmissionException>()),
        );
        await expectLater(
          buildAttachment([_webp, _png], title: 'x'),
          throwsA(isA<SubmissionException>()),
        );
        final big = Uint8List(maxAttachmentBytes + 1)..setAll(0, _jpeg);
        await expectLater(
          buildAttachment([big], title: 'x'),
          throwsA(
            isA<SubmissionException>().having(
              (e) => e.message,
              'message',
              contains('5 MB'),
            ),
          ),
        );
      },
    );
  });

  test('pode entregar: por fazer, atrasado ou reenviar até ser devolvido', () {
    expect(canSubmitTask(_task()), isTrue);
    expect(canSubmitTask(_task(state: WorkState.overdue)), isTrue);
    expect(canSubmitTask(_task(state: WorkState.submitted)), isTrue);
    expect(
      canSubmitTask(_task(state: WorkState.submitted, onPaper: true)),
      isFalse,
    );
    expect(canSubmitTask(_task(state: WorkState.returned)), isFalse);
    expect(canSubmitTask(_task(state: WorkState.missed)), isFalse);
    expect(canSubmitTask(_task(archived: true)), isFalse);
  });

  test('o modelo lê archived, acceptsLate e a tentativa do portal', () {
    final t = WorkTask.fromJson({
      'id': 't1',
      'title': 'Ficha',
      'state': 'submitted',
      'archived': true,
      'acceptsLate': false,
      'latest': {'attempt': 2, 'status': 'submitted'},
    });
    expect(t.archived, isTrue);
    expect(t.acceptsLate, isFalse);
    expect(t.attempt, 2);
    final plain = WorkTask.fromJson({'id': 't2', 'state': 'open'});
    expect(plain.archived, isFalse);
    expect(plain.acceptsLate, isTrue);
    expect(plain.attempt, 0);
  });

  group('envio', () {
    test('manda a tarefa, o texto aparado e o anexo em base64', () async {
      final portal = _Portal((_) => (200, {'attempt': 2, 'late': true}));
      final r = await submitWork(
        _dio(portal),
        taskId: 't1',
        body: '  Feito.  ',
        attachment: WorkAttachment(
          name: 'ficha.jpg',
          contentType: 'image/jpeg',
          bytes: _jpeg,
        ),
      );
      expect(r.attempt, 2);
      expect(r.late, isTrue);
      final sent = portal.requests.single;
      expect(sent.method, 'POST');
      expect(sent.path, '/api/mobile/work');
      expect(sent.data, {
        'action': 'submit',
        'taskId': 't1',
        'body': 'Feito.',
        'attachment': {
          'name': 'ficha.jpg',
          'contentType': 'image/jpeg',
          'base64': base64Encode(_jpeg),
        },
      });
    });

    test('sem texto nem fotos não envia nada', () async {
      final portal = _Portal((_) => (200, {}));
      await expectLater(
        submitWork(_dio(portal), taskId: 't1', body: '  '),
        throwsA(isA<SubmissionException>()),
      );
      expect(portal.requests, isEmpty);
    });

    test('a recusa do portal chega com o texto do SIGA', () async {
      final portal = _Portal(
        (_) => (
          400,
          {
            'error': 'REJECTED',
            'message': 'O professor já devolveu esta entrega.',
          },
        ),
      );
      try {
        await submitWork(_dio(portal), taskId: 't1', body: 'x');
        fail('devia falhar');
      } catch (e) {
        expect(
          submissionErrorMessage(e),
          'O professor já devolveu esta entrega.',
        );
      }
    });

    test('sem rede: diz que não foi entregue e que as fotos ficam', () {
      final e = DioException(
        requestOptions: RequestOptions(path: '/api/mobile/work'),
        type: DioExceptionType.connectionError,
      );
      expect(submissionErrorMessage(e), contains('não foi entregue'));
    });
  });

  testWidgets('página: fotografar duas páginas e entregar num PDF', (
    tester,
  ) async {
    GoogleFonts.config.allowRuntimeFetching = false;
    final portal = _Portal((_) => (200, {'attempt': 1, 'late': false}));
    SubmissionResult? result;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [sgaPortalDioProvider.overrideWithValue(_dio(portal))],
        child: MaterialApp(
          theme: AppTheme.build(reduceMotion: true),
          home: Builder(
            builder: (context) => TextButton(
              onPressed: () async {
                result = await Navigator.of(context).push<SubmissionResult>(
                  MaterialPageRoute(
                    builder: (_) => SubmitWorkScreen(
                      task: _task(),
                      pickOverride: (_, _) async => [_png],
                    ),
                  ),
                );
              },
              child: const Text('abrir'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('abrir'));
    await tester.pumpAndSettle();

    // Sem fotos nem texto, «Entregar» está desligado.
    final send = find.widgetWithText(FilledButton, 'Entregar');
    expect(tester.widget<FilledButton>(send).onPressed, isNull);

    await tester.tap(find.text('Fotografar'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Da galeria'));
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel('Página 2'), findsOneWidget);

    await tester.runAsync(() async {
      await tester.tap(send);
      // O PDF faz-se fora do relógio do teste.
      for (var i = 0; i < 50 && portal.requests.isEmpty; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 20));
      }
    });
    await tester.pumpAndSettle();

    final data = portal.requests.single.data as Map<String, dynamic>;
    final attachment = data['attachment'] as Map<String, dynamic>;
    expect(attachment['contentType'], 'application/pdf');
    expect(
      ascii.decode(base64Decode(attachment['base64'] as String).sublist(0, 5)),
      '%PDF-',
    );
    expect(result?.attempt, 1);
    expect(find.text('abrir'), findsOneWidget);
  });
}
