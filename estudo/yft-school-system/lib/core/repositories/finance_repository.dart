import 'package:dio/dio.dart';
import '../models/arrears_student.dart';
import '../models/fee_receipt.dart';
import '../models/transaction.dart';
import '../network/api_endpoints.dart';

class FinanceRepository {
  final Dio _dio;

  FinanceRepository(this._dio);

  Future<List<ArrearsStudent>> getArrears() async {
    final response = await _dio.get(ApiEndpoints.financeArrears);
    final data = response.data['data'] as List;
    return data
        .map((e) => ArrearsStudent.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<FeeReceipt>> getReceipts() async {
    final response = await _dio.get(ApiEndpoints.financeReceipts);
    final data = response.data['data'] as List;
    return data
        .map((e) => FeeReceipt.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<PaymentResult> logPayment({
    required String studentId,
    required double amount,
    String? description,
    /// Must match server record when provided (same student the UI showed).
    String? verifyStudentName,
    String? verifyClassId,
  }) async {
    final data = <String, dynamic>{
      'student_id': studentId,
      'amount': amount,
      if (description != null && description.trim().isNotEmpty)
        'description': description.trim(),
      if (verifyStudentName != null && verifyStudentName.trim().isNotEmpty)
        'verify_student_name': verifyStudentName.trim(),
      if (verifyClassId != null && verifyClassId.trim().isNotEmpty)
        'verify_class_id': verifyClassId.trim(),
    };
    final response = await _dio.post(
      ApiEndpoints.financePayment,
      data: data,
    );
    return PaymentResult.fromJson(response.data as Map<String, dynamic>);
  }

  Future<Map<String, dynamic>> adjustClassFee({
    required String classId,
    required double amountDelta,
    required String description,
  }) async {
    final response = await _dio.post(
      ApiEndpoints.financeAdjustClassFee,
      data: {
        'class_id': classId,
        'amount_delta': amountDelta,
        'description': description,
      },
    );
    return response.data as Map<String, dynamic>;
  }
}
