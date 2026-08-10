export const schoolYear = "Ano Lectivo 2024/2025";

export const stats = [
  {
    label: "Total de estudantes",
    value: "7",
    icon: "users",
    tone: "primary" as const,
    hint: "+2 este mês",
  },
  {
    label: "Estudantes masculinos",
    value: "6",
    icon: "userCheck",
    tone: "info" as const,
    hint: "86% do total",
  },
  {
    label: "Estudantes femininos",
    value: "1",
    icon: "userRound",
    tone: "pink" as const,
    hint: "14% do total",
  },
  {
    label: "Documentos emitidos",
    value: "0",
    icon: "receipt",
    tone: "warning" as const,
    hint: "Nenhum este ano",
  },
];

export const miniStats = [
  { label: "Cursos", value: "2", icon: "graduation" },
  { label: "Turmas activas", value: "13", icon: "building" },
  { label: "Salas", value: "1", icon: "door" },
  { label: "Taxa de presença", value: "100%", icon: "activity" },
];

export const studentsByClass = [
  { classe: "1ª", alunos: 3 },
  { classe: "3ª", alunos: 0 },
  { classe: "5ª", alunos: 0 },
  { classe: "7ª", alunos: 2 },
  { classe: "9ª", alunos: 1 },
  { classe: "11ª", alunos: 2 },
  { classe: "13ª", alunos: 0 },
];

export const genderSplit = [
  { name: "Masculino", value: 6 },
  { name: "Feminino", value: 1 },
];

export const enrollmentsByMonth = [
  { mes: "set/24", matriculas: 3 },
  { mes: "out/24", matriculas: 1 },
  { mes: "nov/24", matriculas: 0 },
  { mes: "dez/24", matriculas: 1 },
  { mes: "jan/25", matriculas: 0 },
  { mes: "fev/25", matriculas: 2 },
  { mes: "mar/25", matriculas: 0 },
  { mes: "abr/25", matriculas: 0 },
  { mes: "mai/25", matriculas: 0 },
  { mes: "jun/25", matriculas: 0 },
  { mes: "jul/25", matriculas: 0 },
];

export const attendanceRate = [
  { mes: "mar/25", taxa: 96 },
  { mes: "abr/25", taxa: 98 },
  { mes: "mai/25", taxa: 94 },
  { mes: "jun/25", taxa: 99 },
  { mes: "jul/25", taxa: 100 },
];

export const financeSummary = [
  { estado: "Emitido", valor: 0 },
  { estado: "Pago", valor: 0 },
  { estado: "Dívida", valor: 0 },
];

export const ageDistribution = [
  { faixa: "6-9", alunos: 3 },
  { faixa: "10-12", alunos: 1 },
  { faixa: "13-15", alunos: 1 },
  { faixa: "16-18", alunos: 2 },
];

export const recentActivity = [
  {
    title: "Nova matrícula confirmada",
    detail: "João Baptista · 7ª Classe",
    time: "há 2 h",
    tone: "success" as const,
  },
  { title: "Turma criada", detail: "11ª Classe · Turma B", time: "há 5 h", tone: "info" as const },
  {
    title: "Pagamento pendente",
    detail: "Ana Cardoso · Mensalidade Julho",
    time: "ontem",
    tone: "warning" as const,
  },
  {
    title: "Documento solicitado",
    detail: "Declaração com notas · 9ª Classe",
    time: "há 2 dias",
    tone: "primary" as const,
  },
];

export const upcoming = [
  { title: "Fecho de notas do 3º trimestre", date: "12 Ago" },
  { title: "Reunião de encarregados", date: "18 Ago" },
  { title: "Início das matrículas 2025/2026", date: "01 Set" },
];

export const enrollmentStatus = [
  { estado: "Matriculado", total: 5 },
  { estado: "Transferido", total: 1 },
  { estado: "Inactivo", total: 1 },
];

export const topClasses = [
  { classe: "1ª Classe", curso: "Sem Curso", turma: "AM", sala: "Sala 01", alunos: 3 },
  { classe: "2ª Classe", curso: "Sem Curso", turma: "AM", sala: "Sala 01", alunos: 0 },
  { classe: "3ª Classe", curso: "Sem Curso", turma: "AM", sala: "Sala 01", alunos: 0 },
  { classe: "4ª Classe", curso: "Sem Curso", turma: "AM", sala: "Sala 01", alunos: 0 },
];

export const studentsByCourse = [
  { curso: "Ciências Económicas e Jurídicas", alunos: 2 },
  { curso: "Ensino Geral", alunos: 2 },
  { curso: "Ensino Primário", alunos: 3 },
];
