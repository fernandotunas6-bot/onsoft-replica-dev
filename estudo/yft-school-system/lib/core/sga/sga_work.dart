import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/auth_state.dart';
import '../../features/reports/presentation/providers/wards_provider.dart';
import 'sga_attendance.dart' show sgaPortalDioProvider;
import 'sga_config.dart';

/// Uma aula do horário, como a agenda do portal a devolve.
class AgendaLesson {
  final String subjectName;
  final String startsAt;
  final String endsAt;

  /// 0 = hoje, 1 = amanhã…
  final int daysAhead;

  const AgendaLesson({
    required this.subjectName,
    required this.startsAt,
    required this.endsAt,
    required this.daysAhead,
  });

  factory AgendaLesson.fromJson(Map<String, dynamic> j) => AgendaLesson(
    subjectName: j['subjectName'] as String? ?? 'Aula',
    startsAt: (j['startsAt'] as String? ?? '').padRight(5).substring(0, 5),
    endsAt: (j['endsAt'] as String? ?? '').padRight(5).substring(0, 5),
    daysAhead: (j['daysAhead'] as num?)?.toInt() ?? 0,
  );
}

/// Uma avaliação marcada (prova, teste…).
class AgendaAssessment {
  final String name;
  final String subjectName;
  final DateTime? date;
  final String? kind;

  const AgendaAssessment({
    required this.name,
    required this.subjectName,
    this.date,
    this.kind,
  });

  factory AgendaAssessment.fromJson(Map<String, dynamic> j) => AgendaAssessment(
    name: j['name'] as String? ?? 'Avaliação',
    subjectName: j['subjectName'] as String? ?? '',
    date: DateTime.tryParse(j['date'] as String? ?? ''),
    kind: j['kind'] as String?,
  );
}

/// O «Hoje» do aluno: turma, média, próxima aula e avaliações marcadas
/// (`/api/mobile/agenda`, o `getMyStudentAgenda` do portal).
class StudentAgenda {
  final String? className;
  final double? average;
  final AgendaLesson? nextLesson;
  final List<AgendaAssessment> upcomingAssessments;

  const StudentAgenda({
    this.className,
    this.average,
    this.nextLesson,
    this.upcomingAssessments = const [],
  });

  AgendaAssessment? get nextAssessment =>
      upcomingAssessments.isEmpty ? null : upcomingAssessments.first;

  factory StudentAgenda.fromJson(Map<String, dynamic> j) => StudentAgenda(
    className: j['className'] as String?,
    average: (j['average'] as num?)?.toDouble(),
    nextLesson: j['nextLesson'] is Map<String, dynamic>
        ? AgendaLesson.fromJson(j['nextLesson'] as Map<String, dynamic>)
        : null,
    upcomingAssessments: [
      for (final a in (j['upcomingAssessments'] as List? ?? const []))
        if (a is Map<String, dynamic>) AgendaAssessment.fromJson(a),
    ],
  );
}

/// Estado de um trabalho para o aluno, como o portal o calcula.
enum WorkState { overdue, open, submitted, returned, missed }

WorkState _workState(String? raw) => switch (raw) {
  'overdue' => WorkState.overdue,
  'open' => WorkState.open,
  'submitted' => WorkState.submitted,
  'returned' => WorkState.returned,
  _ => WorkState.missed,
};

/// Um trabalho da turma, com a entrega mais recente do aluno.
class WorkTask {
  final String id;
  final String title;
  final String kind;
  final String? description;
  final String subjectName;
  final DateTime? dueOn;
  final WorkState state;
  final bool countsForPauta;

  /// Só depois de devolvido (o portal esconde-os antes).
  final double? grade;
  final String? feedback;
  final DateTime? submittedAt;
  final bool late;
  final bool onPaper;

  /// Tentativa da entrega mais recente (0 sem entrega).
  final int attempt;

  /// O que o aluno entregou na última tentativa: a resposta escrita e o anexo.
  final String? answer;
  final String? fileName;
  final int? fileSize;

  /// Já não recebe entregas (arquivado, ou de uma matrícula que já não está activa).
  final bool archived;
  final bool acceptsLate;

  const WorkTask({
    required this.id,
    required this.title,
    required this.kind,
    required this.subjectName,
    required this.state,
    this.description,
    this.dueOn,
    this.countsForPauta = false,
    this.grade,
    this.feedback,
    this.submittedAt,
    this.late = false,
    this.onPaper = false,
    this.attempt = 0,
    this.answer,
    this.fileName,
    this.fileSize,
    this.archived = false,
    this.acceptsLate = true,
  });

  /// Ainda pede acção do aluno.
  bool get pending => state == WorkState.open || state == WorkState.overdue;

  factory WorkTask.fromJson(Map<String, dynamic> j) {
    final latest = j['latest'] is Map<String, dynamic>
        ? j['latest'] as Map<String, dynamic>
        : const <String, dynamic>{};
    final file = latest['file'] is Map<String, dynamic>
        ? latest['file'] as Map<String, dynamic>
        : const <String, dynamic>{};
    return WorkTask(
      id: j['id'] as String,
      title: j['title'] as String? ?? 'Trabalho',
      kind: j['kind'] as String? ?? 'outra',
      description: j['description'] as String?,
      subjectName: j['subjectName'] as String? ?? '',
      dueOn: DateTime.tryParse(j['dueOn'] as String? ?? ''),
      state: _workState(j['state'] as String?),
      countsForPauta: j['countsForPauta'] == true,
      grade: (latest['grade'] as num?)?.toDouble(),
      feedback: latest['feedback'] as String?,
      submittedAt: DateTime.tryParse(latest['submittedAt'] as String? ?? ''),
      late: latest['isLate'] == true,
      onPaper: latest['onPaper'] == true,
      attempt: (latest['attempt'] as num?)?.toInt() ?? 0,
      answer: (latest['body'] as String?)?.trim().isEmpty ?? true
          ? null
          : (latest['body'] as String).trim(),
      fileName: file['name'] as String?,
      fileSize: (file['sizeBytes'] as num?)?.toInt(),
      archived: j['archived'] == true,
      acceptsLate: j['acceptsLate'] != false,
    );
  }
}

/// Os trabalhos do ano corrente, de todas as disciplinas (`/api/mobile/work`).
class WorkOverview {
  /// Só o próprio aluno entrega (na app ou no portal); o encarregado vê.
  final bool canSubmit;

  /// Média das notas devolvidas (0–20).
  final double? average;
  final List<WorkTask> tasks;

  const WorkOverview({
    this.canSubmit = false,
    this.average,
    this.tasks = const [],
  });

  List<WorkTask> get pending => tasks.where((t) => t.pending).toList();

  factory WorkOverview.fromJson(Map<String, dynamic> j) {
    final summary = j['summary'] is Map<String, dynamic>
        ? j['summary'] as Map<String, dynamic>
        : const <String, dynamic>{};
    return WorkOverview(
      canSubmit: j['canSubmit'] == true,
      average: (summary['average'] as num?)?.toDouble(),
      tasks: [
        for (final t in (j['tasks'] as List? ?? const []))
          if (t is Map<String, dynamic>) WorkTask.fromJson(t),
      ],
    );
  }
}

/// Leituras do portal do SIGA para a vista do aluno.
class SgaWorkRepository {
  final Dio _portal;

  SgaWorkRepository(this._portal);

  Map<String, dynamic>? _query(String? studentId) =>
      studentId == null ? null : {'student_id': studentId};

  Future<StudentAgenda> getAgenda(String? studentId) async {
    final res = await _portal.get(
      '/api/mobile/agenda',
      queryParameters: _query(studentId),
    );
    return StudentAgenda.fromJson(res.data as Map<String, dynamic>);
  }

  Future<WorkOverview> getWork(String? studentId) async {
    final res = await _portal.get(
      '/api/mobile/work',
      queryParameters: _query(studentId),
    );
    return WorkOverview.fromJson(res.data as Map<String, dynamic>);
  }
}

final sgaWorkRepositoryProvider = Provider<SgaWorkRepository>(
  (ref) => SgaWorkRepository(ref.watch(sgaPortalDioProvider)),
);

/// O educando que o encarregado escolheu no Início (null = o primeiro).
class FocusWardNotifier extends Notifier<String?> {
  @override
  String? build() => null;

  void select(String? studentId) => state = studentId;
}

final focusWardProvider = NotifierProvider<FocusWardNotifier, String?>(
  FocusWardNotifier.new,
);

/// De quem são a agenda e os trabalhos do Início: o próprio aluno (null, o
/// portal resolve pela conta) ou o educando escolhido pelo encarregado.
final homeStudentIdProvider = Provider<String?>((ref) {
  final session = ref.watch(authProvider);
  if (session == null || session.isStudent) return null;
  final picked = ref.watch(focusWardProvider);
  if (picked != null) return picked;
  final wards = ref.watch(wardsProvider).whenOrNull(data: (w) => w) ?? const [];
  return wards.isEmpty ? null : wards.first.id;
});

final studentAgendaProvider = FutureProvider.family<StudentAgenda?, String?>((
  ref,
  studentId,
) async {
  if (!sgaMode) return null;
  return ref.watch(sgaWorkRepositoryProvider).getAgenda(studentId);
});

final workOverviewProvider = FutureProvider.family<WorkOverview?, String?>((
  ref,
  studentId,
) async {
  if (!sgaMode) return null;
  return ref.watch(sgaWorkRepositoryProvider).getWork(studentId);
});

/// «320 KB», «1.4 MB» (com ponto, como os outros números da app).
String formatFileSize(int bytes) {
  if (bytes < 1024) return '$bytes B';
  if (bytes < 1024 * 1024) return '${(bytes / 1024).round()} KB';
  return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
}
