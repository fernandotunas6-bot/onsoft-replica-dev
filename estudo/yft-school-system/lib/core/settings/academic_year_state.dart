import 'package:flutter_riverpod/flutter_riverpod.dart';
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
    return AcademicYearSettings.defaults;
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
