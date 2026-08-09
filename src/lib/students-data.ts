export type StudentStatus = "Matriculado" | "Inactivo" | "Transferido";
export type PaymentStatus = "Regularizado" | "Pendente" | "Em dívida";

export type Student = {
  id: string;
  processo: string;
  nome: string;
  genero: "Masculino" | "Feminino";
  dataNascimento: string;
  classe: string;
  turma: string;
  curso: string;
  encarregado: string;
  telefone: string;
  email: string;
  morada: string;
  estado: StudentStatus;
  pagamento: PaymentStatus;
  mediaFinal: number;
  presenca: number;
  matriculadoEm: string;
};

export const students: Student[] = [
  {
    id: "1",
    processo: "PR-2024-001",
    nome: "João Baptista Miguel",
    genero: "Masculino",
    dataNascimento: "2011-03-14",
    classe: "7ª",
    turma: "A",
    curso: "Ensino Geral",
    encarregado: "Miguel Baptista",
    telefone: "+244 923 111 222",
    email: "joao.baptista@escola.com",
    morada: "Rua da Liberdade, 42 · Luanda",
    estado: "Matriculado",
    pagamento: "Regularizado",
    mediaFinal: 15.4,
    presenca: 98,
    matriculadoEm: "2024-09-12",
  },
  {
    id: "2",
    processo: "PR-2024-002",
    nome: "Ana Cardoso Fernandes",
    genero: "Feminino",
    dataNascimento: "2008-07-02",
    classe: "11ª",
    turma: "B",
    curso: "Ciências Físicas e Biológicas",
    encarregado: "Rosa Fernandes",
    telefone: "+244 921 334 908",
    email: "ana.cardoso@escola.com",
    morada: "Bairro Alvalade, 15 · Luanda",
    estado: "Matriculado",
    pagamento: "Pendente",
    mediaFinal: 16.8,
    presenca: 95,
    matriculadoEm: "2024-09-14",
  },
  {
    id: "3",
    processo: "PR-2024-003",
    nome: "Pedro Nzinga Lopes",
    genero: "Masculino",
    dataNascimento: "2017-01-21",
    classe: "1ª",
    turma: "A",
    curso: "Ensino Primário",
    encarregado: "Teresa Lopes",
    telefone: "+244 927 552 010",
    email: "pedro.nzinga@escola.com",
    morada: "Rua 21 de Janeiro, 8 · Viana",
    estado: "Matriculado",
    pagamento: "Regularizado",
    mediaFinal: 13.2,
    presenca: 100,
    matriculadoEm: "2024-09-02",
  },
  {
    id: "4",
    processo: "PR-2024-004",
    nome: "Mateus Domingos Kial",
    genero: "Masculino",
    dataNascimento: "2016-11-05",
    classe: "1ª",
    turma: "A",
    curso: "Ensino Primário",
    encarregado: "Domingos Kial",
    telefone: "+244 923 887 441",
    email: "mateus.kial@escola.com",
    morada: "Bairro Cassenda, 77 · Luanda",
    estado: "Matriculado",
    pagamento: "Em dívida",
    mediaFinal: 12.6,
    presenca: 91,
    matriculadoEm: "2024-10-01",
  },
  {
    id: "5",
    processo: "PR-2024-005",
    nome: "Silvano Alberto Neto",
    genero: "Masculino",
    dataNascimento: "2016-05-19",
    classe: "1ª",
    turma: "B",
    curso: "Ensino Primário",
    encarregado: "Alberto Neto",
    telefone: "+244 926 010 334",
    email: "silvano.neto@escola.com",
    morada: "Rua Amílcar Cabral, 3 · Luanda",
    estado: "Inactivo",
    pagamento: "Pendente",
    mediaFinal: 11.8,
    presenca: 84,
    matriculadoEm: "2024-12-04",
  },
  {
    id: "6",
    processo: "PR-2024-006",
    nome: "Carlos Manuel Sebastião",
    genero: "Masculino",
    dataNascimento: "2010-09-30",
    classe: "9ª",
    turma: "A",
    curso: "Ensino Geral",
    encarregado: "Manuel Sebastião",
    telefone: "+244 924 776 129",
    email: "carlos.sebastiao@escola.com",
    morada: "Bairro Palanca, 21 · Luanda",
    estado: "Matriculado",
    pagamento: "Regularizado",
    mediaFinal: 14.1,
    presenca: 97,
    matriculadoEm: "2025-02-10",
  },
  {
    id: "7",
    processo: "PR-2024-007",
    nome: "Alberto Chissengo Dias",
    genero: "Masculino",
    dataNascimento: "2008-02-08",
    classe: "11ª",
    turma: "A",
    curso: "Ciências Económicas e Jurídicas",
    encarregado: "Chissengo Dias",
    telefone: "+244 928 445 662",
    email: "alberto.dias@escola.com",
    morada: "Bairro Maianga, 90 · Luanda",
    estado: "Transferido",
    pagamento: "Regularizado",
    mediaFinal: 15.9,
    presenca: 93,
    matriculadoEm: "2025-02-18",
  },
];

export const classOptions = ["1ª", "3ª", "5ª", "7ª", "9ª", "11ª", "13ª"];
export const statusOptions: StudentStatus[] = ["Matriculado", "Inactivo", "Transferido"];

export const studentSummary = [
  { label: "Total de alunos", value: students.length.toString(), hint: "Ano lectivo actual" },
  {
    label: "Matriculados",
    value: students.filter((s) => s.estado === "Matriculado").length.toString(),
    hint: "Matrícula confirmada",
  },
  {
    label: "Pagamentos pendentes",
    value: students.filter((s) => s.pagamento !== "Regularizado").length.toString(),
    hint: "Requer follow-up",
  },
  {
    label: "Média geral",
    value: (students.reduce((a, s) => a + s.mediaFinal, 0) / students.length).toFixed(1),
    hint: "Escala 0-20",
  },
];

export function getStudent(id: string) {
  return students.find((s) => s.id === id);
}
