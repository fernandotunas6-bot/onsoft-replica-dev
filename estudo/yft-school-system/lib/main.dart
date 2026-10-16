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
import 'firebase_options.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // A letra Outfit vem com a app (assets/google_fonts): a licença aparece
  // na lista de licenças.
  LicenseRegistry.addLicense(() async* {
    final license = await rootBundle.loadString('assets/google_fonts/OFL.txt');
    yield LicenseEntryWithLineBreaks(['google_fonts'], license);
  });
  // Android: [DEFAULT] comes from google-services.json. Passing
  // DefaultFirebaseOptions here throws duplicate-app if they differ slightly
  // from the native config (common after swapping google-services.json).
  if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
    await Firebase.initializeApp();
  } else {
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );
  }
  runApp(const ProviderScope(child: AppRoot()));
}
