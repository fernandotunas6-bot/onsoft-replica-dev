import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:yft_school_system/core/auth/auth_state.dart';
import 'package:yft_school_system/core/models/fee_receipt.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';
import 'package:yft_school_system/core/repositories/finance_repository.dart';
import 'package:yft_school_system/features/finance/presentation/providers/parent_receipts_provider.dart';

class _Auth extends AuthStateNotifier {
  @override
  AppSession? build() => null;

  void signIn(String uid) => state = AppSession(
    role: UserRole.parent,
    userName: uid,
    schoolId: 's',
    uid: uid,
  );
}

class _Finance extends FinanceRepository {
  int calls = 0;
  _Finance() : super(Dio());

  @override
  Future<List<FeeReceipt>> getReceipts() async {
    calls++;
    return const [];
  }
}

void main() {
  test('trocar de conta recarrega os dados em cache', () async {
    final finance = _Finance();
    final container = ProviderContainer(
      overrides: [
        authProvider.overrideWith(_Auth.new),
        financeRepositoryProvider.overrideWithValue(finance),
      ],
    );
    addTearDown(container.dispose);
    final sub = container.listen(parentReceiptsProvider, (_, _) {});
    addTearDown(sub.close);

    (container.read(authProvider.notifier) as _Auth).signIn('pai-1');
    await container.read(parentReceiptsProvider.future);
    final afterFirst = finance.calls;

    (container.read(authProvider.notifier) as _Auth).signIn('pai-2');
    await container.read(parentReceiptsProvider.future);
    expect(finance.calls, greaterThan(afterFirst));

    // A mesma conta (actualizar o perfil) não volta a pedir.
    final afterSecond = finance.calls;
    (container.read(authProvider.notifier) as _Auth).signIn('pai-2');
    await container.read(parentReceiptsProvider.future);
    expect(finance.calls, afterSecond);
  });
}
