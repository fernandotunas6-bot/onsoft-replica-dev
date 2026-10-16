import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:yft_school_system/core/auth/auth_state.dart';
import 'package:yft_school_system/core/providers/repository_providers.dart';
import 'package:yft_school_system/core/repositories/conversations_repository.dart';
import 'package:yft_school_system/features/messages/presentation/conversations.dart';

ChatMessage _m(int i) => ChatMessage(
  id: 'm$i',
  body: 'mensagem $i',
  createdAt: '2026-05-01 10:00:00.000',
  mine: i.isEven,
);

class _Auth extends AuthStateNotifier {
  @override
  AppSession? build() => AppSession(
    role: UserRole.parent,
    userName: 'P',
    schoolId: 's',
    uid: 'p',
  );
}

/// Servidor falso: 150 mensagens, página de 100.
class _Repo extends ConversationsRepository {
  int total = 150;
  _Repo() : super(Dio());

  @override
  Future<ChatThread> thread(String id) async => ChatThread(
    [for (var i = total - 100; i < total; i++) _m(i)],
    'Carlos',
    'teacher',
    hasMore: true,
  );

  @override
  Future<({List<ChatMessage> messages, bool hasMore})> older(
    String id,
    String beforeId,
  ) async {
    final end = int.parse(beforeId.substring(1));
    final start = end - 100 < 0 ? 0 : end - 100;
    return (messages: [for (var i = start; i < end; i++) _m(i)], hasMore: start > 0);
  }
}

void main() {
  testWidgets('ver anteriores junta as antigas e a consulta seguinte não as apaga', (tester) async {
    GoogleFonts.config.allowRuntimeFetching = false;
    final repo = _Repo();
    await tester.pumpWidget(ProviderScope(
      overrides: [
        authProvider.overrideWith(_Auth.new),
        conversationsRepositoryProvider.overrideWithValue(repo)],
      child: const MaterialApp(home: ChatScreen(conversationId: 'c')),
    ));
    for (var i = 0; i < 4; i++) {
      await tester.pump(const Duration(milliseconds: 20));
    }

    final list = find.byType(ListView);
    expect(list, findsOneWidget);
    expect(find.text('mensagem 149'), findsOneWidget);
    await tester.drag(list, const Offset(0, 100000));
    await tester.pump();
    await tester.tap(find.text('Ver mensagens anteriores'));
    await tester.pump();
    await tester.pump();
    await tester.drag(list, const Offset(0, 100000));
    await tester.pump();
    expect(find.text('mensagem 0'), findsOneWidget);
    expect(find.text('Ver mensagens anteriores'), findsNothing);

    // Chega uma nova: a página mais recente avança, as antigas ficam.
    repo.total = 151;
    final container = ProviderScope.containerOf(tester.element(list));
    container.invalidate(chatThreadProvider('c'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    await tester.drag(list, const Offset(0, -1000000));
    await tester.pump();
    expect(find.text('mensagem 150'), findsOneWidget);
    await tester.drag(list, const Offset(0, 1000000));
    await tester.pump();
    expect(find.text('mensagem 0'), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
  });
}
