import 'package:flutter/physics.dart';
import 'package:flutter/widgets.dart';

/// Curva de mola (Material 3 Expressive): parte depressa e assenta com um
/// ressalto pequeno. [seconds] é o tempo em que a mola fica parada; usar a
/// mesma duração na animação.
class SpringCurve extends Curve {
  final SpringSimulation _sim;
  final double seconds;

  SpringCurve({
    required double dampingRatio,
    required double stiffness,
    this.seconds = 0.35,
  }) : _sim = SpringSimulation(
         SpringDescription.withDampingRatio(
           mass: 1,
           stiffness: stiffness,
           ratio: dampingRatio,
         ),
         0,
         1,
         0,
       );

  @override
  double transformInternal(double t) => _sim.x(t * seconds);
}

/// O movimento da app, num só sítio. Formas e posições usam mola; cor e
/// opacidade, uma curva sem ressalto. Com «reduzir movimento» (sistema ou
/// Aparência) as durações passam a zero.
abstract final class AppMotion {
  /// Rápida, para o toque (cartões, separadores): ressalto de ~9 %.
  static final Curve press = SpringCurve(dampingRatio: 0.6, stiffness: 800);

  /// Para formas que mudam (indicador da barra, pílulas): ressalto de ~1,5 %.
  static final Curve spatial = SpringCurve(
    dampingRatio: 0.8,
    stiffness: 380,
    seconds: 0.5,
  );

  /// Cor e opacidade.
  static const Curve effects = Curves.easeOutCubic;

  static const Duration fast = Duration(milliseconds: 150);
  static const Duration medium = Duration(milliseconds: 350);
  static const Duration slow = Duration(milliseconds: 500);

  static bool reduced(BuildContext context) =>
      MediaQuery.maybeDisableAnimationsOf(context) ?? false;

  /// [d], ou zero com «reduzir movimento».
  static Duration of(BuildContext context, Duration d) =>
      reduced(context) ? Duration.zero : d;
}
