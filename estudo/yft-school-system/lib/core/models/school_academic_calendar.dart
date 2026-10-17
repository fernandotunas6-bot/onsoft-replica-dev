class AcademicCalendarTerm {
  final String name;
  final DateTime startDate;
  final DateTime endDate;

  const AcademicCalendarTerm({
    required this.name,
    required this.startDate,
    required this.endDate,
  });

  factory AcademicCalendarTerm.fromJson(Map<String, dynamic> json) {
    return AcademicCalendarTerm(
      name: json['name'] as String,
      startDate: DateTime.parse(json['start_date'] as String),
      endDate: DateTime.parse(json['end_date'] as String),
    );
  }

  Map<String, dynamic> toJson() => {
        'name': name,
        'start_date': startDate.toIso8601String().split('T').first,
        'end_date': endDate.toIso8601String().split('T').first,
      };
}

class SchoolAcademicCalendar {
  final String academicYear;
  final String activeTerm;
  final String currency;
  final int termSystem;
  final List<AcademicCalendarTerm> terms;
  final String? updatedAt;

  const SchoolAcademicCalendar({
    required this.academicYear,
    required this.activeTerm,
    required this.currency,
    required this.termSystem,
    required this.terms,
    this.updatedAt,
  });

  factory SchoolAcademicCalendar.fromJson(Map<String, dynamic> json) {
    final rawTerms = json['terms'];
    final terms = rawTerms is List
        ? rawTerms
            .map((e) => AcademicCalendarTerm.fromJson(e as Map<String, dynamic>))
            .toList()
        : <AcademicCalendarTerm>[];

    return SchoolAcademicCalendar(
      academicYear: json['academic_year'] as String,
      activeTerm: json['active_term'] as String,
      currency: json['currency'] as String,
      termSystem: (json['term_system'] as num).toInt(),
      terms: terms,
      updatedAt: json['updated_at'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'academic_year': academicYear,
        'active_term': activeTerm,
        'currency': currency,
        'term_system': termSystem,
        'terms': terms.map((term) => term.toJson()).toList(),
      };

  bool get isConfigured =>
      academicYear.isNotEmpty && activeTerm.isNotEmpty && terms.isNotEmpty;
}