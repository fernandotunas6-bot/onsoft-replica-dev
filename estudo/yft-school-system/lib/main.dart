import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart'
    show
        LicenseEntryWithLineBreaks,
        LicenseRegistry,
        defaultTargetPlatform,
        kIsWeb,
        TargetPlatform;
import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:yft_school_system/app_root.dart';
import 'package:yft_school_system/core/notify/background_notify.dart';
import 'package:yft_school_system/core/notify/phone_notifications.dart';
import 'package:yft_school_system/core/realtime/live_updates.dart';
import 'package:yft_school_system/core/routing/app_router.dart';
import 'package:yft_school_system/core/sga/sga_config.dart';
import 'firebase_options.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // A letra Outfit vem com a app (assets/google_fonts): a licença aparece
  // na lista de licenças.
  LicenseRegistry.addLicense(() async* {
    final license = await rootBundle.loadString('assets/google_fonts/OFL.txt');
    yield LicenseEntryWithLineBreaks(['google_fonts'], license);
  });
  // No modo SIGA a conta é a do Supabase do SIGA: o Firebase não arranca.
  if (!sgaMode) await _initFirebase();
  if (sgaMode) {
    // Notificações no telemóvel: tocar abre o ecrã do aviso. A verificação em
    // segundo plano (Android) regista-se aqui; corre de meia em meia hora.
    await PhoneNotifications.instance.init(
      onTap: (route) => appRouter.push(route),
    );
    await BackgroundNotify.initialize();
  }
  // LiveUpdates: tempo real e avisos novos enquanto a sessão está aberta.
  runApp(const ProviderScope(child: LiveUpdates(child: AppRoot())));
}

Future<void> _initFirebase() async {
  // Android: com google-services.json, o [DEFAULT] nativo manda, e passar
  // DefaultFirebaseOptions aqui dava duplicate-app se diferissem. Sem ele (o
  // build actual), a inicialização nativa falha e valem as opções em Dart.
  if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
    try {
      await Firebase.initializeApp();
      return;
    } catch (_) {
      // Sem configuração nativa: segue para as opções em Dart.
    }
  }
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
}
