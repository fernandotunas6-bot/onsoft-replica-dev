import 'package:flutter/widgets.dart';

/// Ícones Lucide usados pela app, como `IconData` simples.
///
/// O pacote `lucide_icons` declara os seus ícones através de uma subclasse
/// `LucideIconData extends IconData`. O Flutter 3.47 tornou `IconData` uma
/// classe `final`, pelo que essa subclasse deixou de compilar e prendia o
/// projecto ao 3.41.x. Aqui os mesmos pontos de código são declarados
/// directamente, com a família e o pacote da fonte — que continua a vir do
/// pacote, agora só como asset. Nenhuma biblioteca Dart dele é importada.
///
/// Só estão os ícones que a app usa. Para acrescentar outro, copiar o ponto
/// de código de `lucide_icons.dart` do pacote.
const _family = 'Lucide';
const _package = 'lucide_icons';

abstract final class LucideIcons {
  const LucideIcons._();

  static const IconData alertCircle = IconData(
    0xf10b,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData alertTriangle = IconData(
    0xf10d,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData alignLeft = IconData(
    0xf11c,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData arrowLeft = IconData(
    0xf14f,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData award = IconData(
    0xf172,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData baby = IconData(
    0xf175,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData banknote = IconData(
    0xf184,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData barChart2 = IconData(
    0xf186,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData barChart3 = IconData(
    0xf187,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData bell = IconData(
    0xf19c,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData book = IconData(
    0xf1af,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData bookOpen = IconData(
    0xf1b6,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData briefcase = IconData(
    0xf1c9,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData building2 = IconData(
    0xf1cd,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData calendar = IconData(
    0xf1d2,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData calendarCheck = IconData(
    0xf1d3,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData calendarClock = IconData(
    0xf1d5,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData calendarDays = IconData(
    0xf1d6,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData calendarRange = IconData(
    0xf1db,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData camera = IconData(
    0xf1df,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData checkCircle = IconData(
    0xf1f0,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData checkCircle2 = IconData(
    0xf1f1,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData chevronDown = IconData(
    0xf1f5,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData chevronRight = IconData(
    0xf1fb,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData circle = IconData(
    0xf20b,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData clipboardList = IconData(
    0xf21c,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData clipboardSignature = IconData(
    0xf21e,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData clock = IconData(
    0xf221,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData coins = IconData(
    0xf245,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData contact = IconData(
    0xf24d,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData creditCard = IconData(
    0xf264,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData download = IconData(
    0xf287,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData droplet = IconData(
    0xf28a,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData eye = IconData(
    0xf29c,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData eyeOff = IconData(
    0xf29d,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData fileSpreadsheet = IconData(
    0xf2cf,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData fileText = IconData(
    0xf2d3,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData graduationCap = IconData(
    0xf33e,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData hash = IconData(
    0xf34a,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData headphones = IconData(
    0xf353,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData heart = IconData(
    0xf354,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData heartHandshake = IconData(
    0xf356,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData heartPulse = IconData(
    0xf358,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData helpCircle = IconData(
    0xf359,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData home = IconData(
    0xf35e,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData info = IconData(
    0xf36e,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData lifeBuoy = IconData(
    0xf392,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData list = IconData(
    0xf39b,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData lock = IconData(
    0xf3ae,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData logOut = IconData(
    0xf3b0,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData mail = IconData(
    0xf3b4,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData mailCheck = IconData(
    0xf3b5,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData mapPin = IconData(
    0xf3c0,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData megaphone = IconData(
    0xf3c6,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData messageSquare = IconData(
    0xf3ce,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData pencil = IconData(
    0xf43d,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData phone = IconData(
    0xf440,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData plus = IconData(
    0xf45e,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData plusCircle = IconData(
    0xf45f,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData receipt = IconData(
    0xf477,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData save = IconData(
    0xf49d,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData school = IconData(
    0xf4a6,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData scrollText = IconData(
    0xf4ac,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData search = IconData(
    0xf4ad,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData send = IconData(
    0xf4b2,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData settings = IconData(
    0xf4b9,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData settings2 = IconData(
    0xf4ba,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData shieldCheck = IconData(
    0xf4c1,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData tag = IconData(
    0xf521,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData trash2 = IconData(
    0xf546,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData type = IconData(
    0xf554,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData user = IconData(
    0xf564,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData userCheck = IconData(
    0xf566,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData userCircle = IconData(
    0xf568,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData userPlus = IconData(
    0xf56e,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData userX = IconData(
    0xf572,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData users = IconData(
    0xf574,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData wallet = IconData(
    0xf588,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData x = IconData(
    0xf59e,
    fontFamily: _family,
    fontPackage: _package,
  );
  static const IconData xCircle = IconData(
    0xf59f,
    fontFamily: _family,
    fontPackage: _package,
  );
}
