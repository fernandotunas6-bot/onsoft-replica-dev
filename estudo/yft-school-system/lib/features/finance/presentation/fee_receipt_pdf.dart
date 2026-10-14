import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:yft_school_system/core/utils/currency_display.dart';
import 'package:yft_school_system/features/finance/presentation/widgets/fee_receipt_template_data.dart';

/// Readable green on white (same RGB as [AppColors.primaryOnLight]).
final PdfColor _kBrandGreen = PdfColor(61 / 255, 79 / 255, 0);
final PdfColor _kOwing = PdfColor(1.0, 0.294, 0.294);

String _formatWhen(String raw) {
  if (raw.isEmpty) return '—';
  return raw.replaceFirst('T', ' ').split('.').first;
}

List<pw.Widget> _contactLinesCentered(String? text) {
  if (text == null || text.trim().isEmpty) return [];
  return [
    pw.Padding(
      padding: const pw.EdgeInsets.only(top: 2),
      child: pw.Center(
        child: pw.Text(
          text.trim(),
          style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey800),
          textAlign: pw.TextAlign.center,
        ),
      ),
    ),
  ];
}

pw.Widget _rowStyled(
  String label,
  String value, {
  PdfColor? labelColor,
  PdfColor? valueColor,
  bool valueBold = false,
}) {
  final lc = labelColor ?? PdfColors.grey700;
  final vc = valueColor ?? PdfColors.black;
  return pw.Padding(
    padding: const pw.EdgeInsets.only(bottom: 7),
    child: pw.Row(
      crossAxisAlignment: pw.CrossAxisAlignment.start,
      children: [
        pw.Expanded(
          flex: 5,
          child: pw.Text(
            label.toUpperCase(),
            style: pw.TextStyle(fontSize: 7, color: lc),
          ),
        ),
        pw.Expanded(
          flex: 6,
          child: pw.Text(
            value,
            style: pw.TextStyle(
              fontSize: valueBold ? 9.5 : 8,
              color: vc,
              fontWeight: valueBold ? pw.FontWeight.bold : pw.FontWeight.normal,
            ),
          ),
        ),
      ],
    ),
  );
}

/// Builds a single-page A4 PDF matching the on-screen formal receipt.
/// Uses ASCII-safe currency codes so symbols like GH₵ do not break fonts.
Future<Uint8List> buildFeeReceiptPdf(FeeReceiptTemplateData data) async {
  final r = data.receipt;
  pw.MemoryImage? mem;
  if (data.logoFullUrl != null && data.logoFullUrl!.isNotEmpty) {
    try {
      final res = await Dio().get<List<int>>(
        data.logoFullUrl!,
        options: Options(
          responseType: ResponseType.bytes,
          sendTimeout: const Duration(seconds: 20),
          receiveTimeout: const Duration(seconds: 20),
        ),
      );
      if (res.data != null && res.data!.isNotEmpty) {
        mem = pw.MemoryImage(Uint8List.fromList(res.data!));
      }
    } catch (_) {}
  }

  final doc = pw.Document();
  doc.addPage(
    pw.Page(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.all(44),
      build: (context) {
        return pw.Stack(
          children: [
            if (mem != null)
              pw.Positioned.fill(
                child: pw.Center(
                  child: pw.Opacity(
                    opacity: 0.06,
                    child: pw.Image(
                      mem,
                      width: 260,
                      height: 260,
                      fit: pw.BoxFit.contain,
                    ),
                  ),
                ),
              ),
            pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.stretch,
              children: [
                pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.center,
                  children: [
                    if (mem != null)
                      pw.SizedBox(
                        width: 56,
                        height: 56,
                        child: pw.Image(mem, fit: pw.BoxFit.contain),
                      )
                    else
                      pw.SizedBox(width: 56, height: 56),
                    pw.SizedBox(height: 10),
                    pw.Text(
                      data.schoolName.toUpperCase(),
                      textAlign: pw.TextAlign.center,
                      style: pw.TextStyle(
                        fontSize: 13,
                        fontWeight: pw.FontWeight.bold,
                        letterSpacing: 0.8,
                      ),
                    ),
                    if (data.motto != null && data.motto!.trim().isNotEmpty)
                      pw.Padding(
                        padding: const pw.EdgeInsets.only(top: 3),
                        child: pw.Text(
                          data.motto!.trim(),
                          textAlign: pw.TextAlign.center,
                          style: pw.TextStyle(
                            fontSize: 8,
                            fontStyle: pw.FontStyle.italic,
                            color: PdfColors.grey700,
                          ),
                        ),
                      ),
                    ..._contactLinesCentered(data.address),
                    ..._contactLinesCentered(data.email),
                    ..._contactLinesCentered(data.phone),
                  ],
                ),
                pw.SizedBox(height: 18),
                pw.Divider(thickness: 0.8, color: PdfColors.grey800),
                pw.SizedBox(height: 14),
                pw.Center(
                  child: pw.Text(
                    'RECIBO DE PROPINA',
                    style: pw.TextStyle(
                      fontSize: 11,
                      fontWeight: pw.FontWeight.bold,
                      letterSpacing: 2,
                    ),
                  ),
                ),
                pw.SizedBox(height: 4),
                pw.Center(
                  child: pw.Text(
                    'Este documento comprova o pagamento registado de propina.',
                    style: const pw.TextStyle(
                      fontSize: 7,
                      color: PdfColors.grey700,
                    ),
                  ),
                ),
                pw.SizedBox(height: 16),
                _rowStyled('Número do recibo', r.id, valueBold: true),
                _rowStyled('Data e hora', _formatWhen(r.createdAt)),
                _rowStyled('Ano lectivo', data.displayAcademicYear),
                _rowStyled('Período', data.displayFeeTerm),
                if (r.studentName != null && r.studentName!.trim().isNotEmpty)
                  _rowStyled('Aluno', r.studentName!.trim()),
                _rowStyled(
                  'Valor recebido',
                  formatMoneyForPdf(r.currency, r.amountPaid),
                  labelColor: _kBrandGreen,
                  valueColor: _kBrandGreen,
                  valueBold: true,
                ),
                _rowStyled(
                  'Aplicado a propinas em dívida',
                  formatMoneyForPdf(r.currency, r.amountToDebt),
                ),
                if (r.creditAdded > 0)
                  _rowStyled(
                    'Crédito acrescentado',
                    formatMoneyForPdf(r.currency, r.creditAdded),
                    labelColor: _kBrandGreen,
                    valueColor: _kBrandGreen,
                    valueBold: true,
                  ),
                _rowStyled(
                  'Saldo antes do pagamento',
                  formatMoneyForPdf(r.currency, r.balanceBefore),
                ),
                _rowStyled(
                  'Saldo depois do pagamento',
                  formatMoneyForPdf(r.currency, r.balanceAfter),
                  valueColor: r.balanceAfter < 0
                      ? _kOwing
                      : (r.balanceAfter > 0 ? _kBrandGreen : PdfColors.black),
                  valueBold: true,
                ),
                if (r.balanceAfter < 0)
                  _rowStyled(
                    'Em dívida depois deste pagamento',
                    formatMoneyForPdf(r.currency, r.balanceAfter.abs()),
                    labelColor: _kOwing,
                    valueColor: _kOwing,
                    valueBold: true,
                  ),
                _rowStyled('Referência da transacção', r.transactionId),
                if (r.description != null && r.description!.trim().isNotEmpty) ...[
                  pw.SizedBox(height: 6),
                  pw.Text(
                    'OBSERVAÇÕES',
                    style: const pw.TextStyle(
                      fontSize: 7,
                      color: PdfColors.grey700,
                    ),
                  ),
                  pw.Text(
                    r.description!.trim(),
                    style: const pw.TextStyle(fontSize: 8),
                  ),
                ],
                pw.SizedBox(height: 18),
                pw.Container(
                  padding: const pw.EdgeInsets.all(10),
                  decoration: pw.BoxDecoration(color: PdfColors.grey200),
                  child: pw.Text(
                    'Guarde este recibo. Para questões de facturação, contacte '
                    'a secretaria pelos contactos acima. Emitido pelo sistema de gestão '
                    'management system.',
                    style: const pw.TextStyle(
                      fontSize: 7,
                      color: PdfColors.grey800,
                    ),
                  ),
                ),
              ],
            ),
          ],
        );
      },
    ),
  );

  return doc.save();
}
