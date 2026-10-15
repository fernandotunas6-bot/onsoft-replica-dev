import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/auth_state.dart';
import '../providers/repository_providers.dart';
import '../utils/date_utils.dart';

class AcademicYearSettings {
  final String academicYear;
  final String activeTerm;
  final String currency;

  AcademicYearSettings({
    required this.academicYear,
    required this.activeTerm,
    required this.currency,
  });

  AcademicYearSettings copyWith({
    String? academicYear,
    String? activeTerm,
    String? currency,
  }) {
    return AcademicYearSettings(
      academicYear: academicYear ?? this.academicYear,
      activeTerm: activeTerm ?? this.activeTerm,
      currency: currency ?? this.currency,
    );
  }

  static AcademicYearSettings get defaults {
    return AcademicYearSettings(
      academicYear: getCurrentAcademicYear(),
      activeTerm: 'Term 1',
      currency: 'GH₵',
    );
  }
}

class AcademicYearNotifier extends Notifier<AcademicYearSettings> {
  @override
  AcademicYearSettings build() {
    // Antes, o ano, o trimestre e a moeda da escola só chegavam quando o
    // administrador abria o calendário académico: até lá, todos os ecrãs
    // mostravam GH₵. Agora carregam-se logo que há sessão.
    if (ref.watch(authProvider) != null) {
      Future.microtask(_loadFromSchool);
    }
    return AcademicYearSettings.defaults;
  }

  Future<void> _loadFromSchool() async {
    try {
      final calendar = await ref
          .read(userRepositoryProvider)
          .getAcademicCalendar();
      if (calendar == null) return;
      state = state.copyWith(
        academicYear: calendar.academicYear,
        activeTerm: calendar.activeTerm,
        currency: calendar.currency,
      );
    } catch (_) {
      // Sem calendário configurado ou sem ligação: ficam os valores por omissão.
    }
  }

  void setAcademicYear(String year) {
    state = state.copyWith(academicYear: year);
  }

  void setActiveTerm(String term) {
    state = state.copyWith(activeTerm: term);
  }

  void setCurrency(String currency) {
    state = state.copyWith(currency: currency);
  }
}

final academicYearProvider =
    NotifierProvider<AcademicYearNotifier, AcademicYearSettings>(() {
      return AcademicYearNotifier();
    });
