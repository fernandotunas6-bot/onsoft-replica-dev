import 'package:firebase_auth/firebase_auth.dart';

/// Validação local antes de pedir ao Firebase. Devolve a mensagem de erro ou
/// null quando os campos estão bem.
String? passwordChangeProblem(String current, String next, String repeat) {
  if (current.isEmpty || next.isEmpty || repeat.isEmpty) {
    return 'Preencha os três campos.';
  }
  if (next.length < 8) {
    return 'A nova senha precisa de pelo menos 8 caracteres.';
  }
  if (next != repeat) return 'A nova senha e a repetição não coincidem.';
  if (next == current) return 'A nova senha tem de ser diferente da actual.';
  return null;
}

/// Troca a senha da conta Firebase actual: confirma a senha actual
/// (reautenticação) e grava a nova. Devolve a mensagem de erro ou null.
Future<String?> changeFirebasePassword(String current, String next) async {
  final user = FirebaseAuth.instance.currentUser;
  final email = user?.email;
  if (user == null || email == null) return 'Sessão terminada. Entre de novo.';
  try {
    await user.reauthenticateWithCredential(
      EmailAuthProvider.credential(email: email, password: current),
    );
    await user.updatePassword(next);
    // Token novo, para o servidor ver a troca ao confirmar.
    await user.getIdToken(true);
    return null;
  } on FirebaseAuthException catch (e) {
    switch (e.code) {
      case 'wrong-password':
      case 'invalid-credential':
        return 'A senha actual está errada.';
      case 'weak-password':
        return 'A nova senha é demasiado fraca.';
      case 'too-many-requests':
        return 'Demasiadas tentativas. Tente mais tarde.';
      case 'requires-recent-login':
        return 'Por segurança, termine a sessão e entre de novo.';
      default:
        return e.message ?? 'Não foi possível mudar a senha.';
    }
  } catch (_) {
    return 'Erro de ligação. Tente novamente.';
  }
}
