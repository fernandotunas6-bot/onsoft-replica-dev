import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:yft_school_system/core/models/fee_receipt.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';

final parentReceiptsProvider = FutureProvider<List<FeeReceipt>>((ref) {
  return ref.read(financeRepositoryProvider).getReceipts();
});
