// Dados de demonstração para os módulos do sistema SIGA.

export const kwanza = (v: number) =>
  new Intl.NumberFormat("pt-AO", { style: "currency", currency: "AOA", maximumFractionDigits: 0 })
    .format(v)
    .replace("AOA", "Kz");

/* ----------------------------- Área Pedagógica ---------------------------- */

export type Turma = {
  id: string;
  nome: string;
  classe: string;
  curso: string;
  sala: string;
  turno: "Manhã" | "Tarde" | "Noite";
  alunos: number;
  capacidade: number;
  director: string;
  media: number;
};

export const turmas: Turma[] = [
  { id: "t1", nome: "7ª A", classe: "7ª", curso: "Ensino Geral", sala: "Sala 12", turno: "Manhã", alunos: 34, capacidade: 40, director: "Prof. Manuel Sousa", media: 14.2 },
  { id: "t2", nome: "7ª B", classe: "7ª", curso: "Ensino Geral", sala: "Sala 13", turno: "Tarde", alunos: 31, capacidade: 40, director: "Prof.ª Teresa Lopes", media: 13.6 },
  { id: "t3", nome: "9ª A", classe: "9ª", curso: "Ensino Geral", sala: "Sala 6", turno: "Manhã", alunos: 38, capacidade: 40, director: "Prof. Adão Neto", media: 14.8 },
  { id: "t4", nome: "11ª A", classe: "11ª", curso: "Ciências Físicas e Biológicas", sala: "Lab. 2", turno: "Manhã", alunos: 29, capacidade: 35, director: "Prof.ª Julieta Bento", media: 15.3 },
  { id: "t5", nome: "11ª B", classe: "11ª", curso: "Ciências Económicas e Jurídicas", sala: "Sala 21", turno: "Tarde", alunos: 27, capacidade: 35, director: "Prof. Nelson Cabral", media: 14.9 },
  { id: "t6", nome: "13ª A", classe: "13ª", curso: "Informática de Gestão", sala: "Lab. Info", turno: "Noite", alunos: 24, capacidade: 30, director: "Prof. Edgar Pinto", media: 15.7 },
];

export type Disciplina = {
  id: string;
  nome: string;
  professor: string;
  classes: string;
  cargaHoraria: string;
  aprovacao: number;
};

export const disciplinas: Disciplina[] = [
  { id: "d1", nome: "Matemática", professor: "Prof. Manuel Sousa", classes: "7ª – 13ª", cargaHoraria: "6h/semana", aprovacao: 78 },
  { id: "d2", nome: "Língua Portuguesa", professor: "Prof.ª Teresa Lopes", classes: "7ª – 13ª", cargaHoraria: "6h/semana", aprovacao: 86 },
  { id: "d3", nome: "Física", professor: "Prof.ª Julieta Bento", classes: "10ª – 13ª", cargaHoraria: "4h/semana", aprovacao: 71 },
  { id: "d4", nome: "Biologia", professor: "Prof. Adão Neto", classes: "7ª – 13ª", cargaHoraria: "4h/semana", aprovacao: 82 },
  { id: "d5", nome: "História", professor: "Prof. Nelson Cabral", classes: "7ª – 11ª", cargaHoraria: "3h/semana", aprovacao: 90 },
  { id: "d6", nome: "Programação", professor: "Prof. Edgar Pinto", classes: "12ª – 13ª", cargaHoraria: "8h/semana", aprovacao: 88 },
];

export type Nota = {
  id: string;
  aluno: string;
  turma: string;
  disciplina: string;
  mac: number;
  npp: number;
  npt: number;
  trimestre: "1º" | "2º" | "3º";
};

export const notas: Nota[] = [
  { id: "n1", aluno: "João Baptista Miguel", turma: "7ª A", disciplina: "Matemática", mac: 15, npp: 14, npt: 16, trimestre: "2º" },
  { id: "n2", aluno: "Ana Cardoso Fernandes", turma: "11ª B", disciplina: "Física", mac: 17, npp: 16, npt: 18, trimestre: "2º" },
  { id: "n3", aluno: "Luís Manuel Kiala", turma: "9ª A", disciplina: "Biologia", mac: 12, npp: 11, npt: 13, trimestre: "2º" },
  { id: "n4", aluno: "Esperança Domingos", turma: "13ª A", disciplina: "Programação", mac: 18, npp: 17, npt: 19, trimestre: "2º" },
  { id: "n5", aluno: "Alberto Dias Chissengo", turma: "11ª A", disciplina: "História", mac: 14, npp: 15, npt: 15, trimestre: "2º" },
  { id: "n6", aluno: "Mariana Bumba", turma: "7ª B", disciplina: "Língua Portuguesa", mac: 13, npp: 12, npt: 14, trimestre: "2º" },
];

export const horario = [
  { hora: "07:30 – 08:20", seg: "Matemática", ter: "Português", qua: "Biologia", qui: "Matemática", sex: "História" },
  { hora: "08:20 – 09:10", seg: "Matemática", ter: "Português", qua: "Biologia", qui: "Física", sex: "História" },
  { hora: "09:30 – 10:20", seg: "Física", ter: "História", qua: "Português", qui: "Física", sex: "Ed. Física" },
  { hora: "10:20 – 11:10", seg: "Biologia", ter: "Matemática", qua: "Programação", qui: "Português", sex: "Ed. Física" },
  { hora: "11:20 – 12:10", seg: "Programação", ter: "Ed. Moral", qua: "Programação", qui: "Geografia", sex: "Direcção de turma" },
];

/* -------------------------------- Documentos ------------------------------- */

export type Documento = {
  id: string;
  tipo: string;
  aluno: string;
  processo: string;
  pedidoEm: string;
  estado: "Emitido" | "Em processamento" | "Pendente de pagamento";
  responsavel: string;
};

export const documentos: Documento[] = [
  { id: "doc1", tipo: "Certificado de Habilitações", aluno: "Esperança Domingos", processo: "PR-2024-004", pedidoEm: "2025-05-02", estado: "Emitido", responsavel: "Secretaria" },
  { id: "doc2", tipo: "Declaração com Notas", aluno: "Ana Cardoso Fernandes", processo: "PR-2024-002", pedidoEm: "2025-05-08", estado: "Em processamento", responsavel: "Secretaria" },
  { id: "doc3", tipo: "Declaração de Matrícula", aluno: "João Baptista Miguel", processo: "PR-2024-001", pedidoEm: "2025-05-11", estado: "Pendente de pagamento", responsavel: "Tesouraria" },
  { id: "doc4", tipo: "Transferência", aluno: "Alberto Dias Chissengo", processo: "PR-2025-011", pedidoEm: "2025-04-27", estado: "Emitido", responsavel: "Direcção" },
  { id: "doc5", tipo: "Boletim de Notas", aluno: "Luís Manuel Kiala", processo: "PR-2024-003", pedidoEm: "2025-05-12", estado: "Em processamento", responsavel: "Área Pedagógica" },
];

export const modelosDocumento = [
  { nome: "Declaração de Matrícula", preco: 2500, prazo: "24 horas" },
  { nome: "Declaração com Notas", preco: 3500, prazo: "48 horas" },
  { nome: "Certificado de Habilitações", preco: 15000, prazo: "5 dias úteis" },
  { nome: "Boletim de Notas", preco: 1500, prazo: "24 horas" },
  { nome: "Pedido de Transferência", preco: 5000, prazo: "3 dias úteis" },
];

/* -------------------------------- Financeiro ------------------------------- */

export type Movimento = {
  id: string;
  data: string;
  descricao: string;
  aluno?: string;
  categoria: "Mensalidade" | "Matrícula" | "Documentos" | "Despesa" | "Salários";
  metodo: "Numerário" | "Multicaixa" | "Transferência" | "Express";
  tipo: "Entrada" | "Saída";
  valor: number;
};

export const movimentos: Movimento[] = [
  { id: "m1", data: "2025-05-12", descricao: "Mensalidade Maio", aluno: "João Baptista Miguel", categoria: "Mensalidade", metodo: "Multicaixa", tipo: "Entrada", valor: 45000 },
  { id: "m2", data: "2025-05-12", descricao: "Mensalidade Maio", aluno: "Mariana Bumba", categoria: "Mensalidade", metodo: "Numerário", tipo: "Entrada", valor: 45000 },
  { id: "m3", data: "2025-05-11", descricao: "Certificado de Habilitações", aluno: "Esperança Domingos", categoria: "Documentos", metodo: "Express", tipo: "Entrada", valor: 15000 },
  { id: "m4", data: "2025-05-10", descricao: "Compra de material de escritório", categoria: "Despesa", metodo: "Transferência", tipo: "Saída", valor: 128000 },
  { id: "m5", data: "2025-05-09", descricao: "Matrícula 2025", aluno: "Luís Manuel Kiala", categoria: "Matrícula", metodo: "Transferência", tipo: "Entrada", valor: 90000 },
  { id: "m6", data: "2025-05-05", descricao: "Salários corpo docente", categoria: "Salários", metodo: "Transferência", tipo: "Saída", valor: 3450000 },
  { id: "m7", data: "2025-05-03", descricao: "Mensalidade Maio", aluno: "Ana Cardoso Fernandes", categoria: "Mensalidade", metodo: "Multicaixa", tipo: "Entrada", valor: 45000 },
];

export const caixaResumo = {
  saldoInicial: 1250000,
  entradas: movimentos.filter((m) => m.tipo === "Entrada").reduce((s, m) => s + m.valor, 0),
  saidas: movimentos.filter((m) => m.tipo === "Saída").reduce((s, m) => s + m.valor, 0),
};

export const mensalidadesPorMes = [
  { mes: "Set", cobrado: 5200000, recebido: 4700000 },
  { mes: "Out", cobrado: 5250000, recebido: 4980000 },
  { mes: "Nov", cobrado: 5250000, recebido: 4600000 },
  { mes: "Dez", cobrado: 5300000, recebido: 5100000 },
  { mes: "Jan", cobrado: 5400000, recebido: 4900000 },
  { mes: "Fev", cobrado: 5400000, recebido: 5250000 },
  { mes: "Mar", cobrado: 5450000, recebido: 5010000 },
  { mes: "Abr", cobrado: 5450000, recebido: 5280000 },
  { mes: "Mai", cobrado: 5500000, recebido: 3900000 },
];

/* --------------------------------- Faturas -------------------------------- */

export type Fatura = {
  id: string;
  numero: string;
  aluno: string;
  descricao: string;
  emitida: string;
  vencimento: string;
  valor: number;
  estado: "Paga" | "Pendente" | "Vencida";
};

export const faturas: Fatura[] = [
  { id: "f1", numero: "FT 2025/0231", aluno: "João Baptista Miguel", descricao: "Mensalidade Maio 2025", emitida: "2025-05-01", vencimento: "2025-05-10", valor: 45000, estado: "Paga" },
  { id: "f2", numero: "FT 2025/0232", aluno: "Ana Cardoso Fernandes", descricao: "Mensalidade Maio 2025", emitida: "2025-05-01", vencimento: "2025-05-10", valor: 45000, estado: "Paga" },
  { id: "f3", numero: "FT 2025/0233", aluno: "Luís Manuel Kiala", descricao: "Mensalidade Maio 2025", emitida: "2025-05-01", vencimento: "2025-05-10", valor: 45000, estado: "Vencida" },
  { id: "f4", numero: "FT 2025/0234", aluno: "Mariana Bumba", descricao: "Mensalidade Maio + Transporte", emitida: "2025-05-01", vencimento: "2025-05-20", valor: 68000, estado: "Pendente" },
  { id: "f5", numero: "FT 2025/0235", aluno: "Esperança Domingos", descricao: "Certificado de Habilitações", emitida: "2025-05-11", vencimento: "2025-05-11", valor: 15000, estado: "Paga" },
  { id: "f6", numero: "FT 2025/0236", aluno: "Alberto Dias Chissengo", descricao: "Mensalidade Abril 2025", emitida: "2025-04-01", vencimento: "2025-04-10", valor: 45000, estado: "Vencida" },
];

/* -------------------------------- Relatórios ------------------------------- */

export const receitaPorCategoria = [
  { categoria: "Mensalidades", valor: 44200000 },
  { categoria: "Matrículas", valor: 9800000 },
  { categoria: "Documentos", valor: 2150000 },
  { categoria: "Transporte", valor: 3600000 },
  { categoria: "Cantina", valor: 2900000 },
];

export const despesaPorCategoria = [
  { categoria: "Salários", valor: 31000000 },
  { categoria: "Infraestrutura", valor: 6400000 },
  { categoria: "Material didáctico", valor: 3200000 },
  { categoria: "Serviços", valor: 2100000 },
];

export const aproveitamentoPorClasse = [
  { classe: "7ª", aprovados: 88, reprovados: 12 },
  { classe: "8ª", aprovados: 84, reprovados: 16 },
  { classe: "9ª", aprovados: 81, reprovados: 19 },
  { classe: "10ª", aprovados: 79, reprovados: 21 },
  { classe: "11ª", aprovados: 86, reprovados: 14 },
  { classe: "12ª", aprovados: 90, reprovados: 10 },
  { classe: "13ª", aprovados: 93, reprovados: 7 },
];

export const mediaPorTrimestre = [
  { trimestre: "1º", media: 13.4 },
  { trimestre: "2º", media: 14.1 },
  { trimestre: "3º", media: 14.8 },
];

/* ----------------------------- Gestão de acessos --------------------------- */

export type Utilizador = {
  id: string;
  nome: string;
  email: string;
  perfil: "Administrador" | "Secretaria" | "Tesouraria" | "Professor" | "Encarregado";
  estado: "Activo" | "Suspenso";
  ultimoAcesso: string;
};

export const utilizadores: Utilizador[] = [
  { id: "u1", nome: "usuario teste", email: "teste@escola.com", perfil: "Administrador", estado: "Activo", ultimoAcesso: "Hoje, 08:12" },
  { id: "u2", nome: "Teresa Lopes", email: "teresa.lopes@escola.com", perfil: "Professor", estado: "Activo", ultimoAcesso: "Hoje, 07:40" },
  { id: "u3", nome: "Carla Neves", email: "carla.neves@escola.com", perfil: "Secretaria", estado: "Activo", ultimoAcesso: "Ontem, 16:22" },
  { id: "u4", nome: "Paulo Ferraz", email: "paulo.ferraz@escola.com", perfil: "Tesouraria", estado: "Activo", ultimoAcesso: "Ontem, 15:03" },
  { id: "u5", nome: "Rosa Fernandes", email: "rosa.fernandes@gmail.com", perfil: "Encarregado", estado: "Suspenso", ultimoAcesso: "12/04/2025" },
];

export const perfisPermissoes = [
  { perfil: "Administrador", alunos: "Total", financeiro: "Total", notas: "Total", config: "Total" },
  { perfil: "Secretaria", alunos: "Total", financeiro: "Leitura", notas: "Leitura", config: "Nenhum" },
  { perfil: "Tesouraria", alunos: "Leitura", financeiro: "Total", notas: "Nenhum", config: "Nenhum" },
  { perfil: "Professor", alunos: "Leitura", financeiro: "Nenhum", notas: "Escrita", config: "Nenhum" },
  { perfil: "Encarregado", alunos: "Próprios", financeiro: "Próprios", notas: "Próprios", config: "Nenhum" },
];

/* ------------------------------ Comunicações ------------------------------ */

export type Comunicado = {
  id: string;
  titulo: string;
  mensagem: string;
  destino: string;
  canal: "SMS" | "E-mail" | "Portal";
  data: string;
  estado: "Enviado" | "Agendado" | "Rascunho";
};

export const comunicados: Comunicado[] = [
  { id: "c1", titulo: "Reunião de encarregados — 2º trimestre", mensagem: "Convocamos todos os encarregados para a reunião no sábado, às 09:00, no salão principal.", destino: "Todos os encarregados", canal: "SMS", data: "2025-05-10", estado: "Enviado" },
  { id: "c2", titulo: "Início das provas trimestrais", mensagem: "As provas do 2º trimestre iniciam a 20 de Maio. Consulte o calendário no portal.", destino: "Alunos 7ª – 13ª", canal: "Portal", data: "2025-05-09", estado: "Enviado" },
  { id: "c3", titulo: "Regularização de mensalidades", mensagem: "Prazo final para regularizar as mensalidades em atraso: 25 de Maio.", destino: "Encarregados com pendências", canal: "E-mail", data: "2025-05-18", estado: "Agendado" },
  { id: "c4", titulo: "Feira de ciências", mensagem: "Inscrições abertas para a feira de ciências da escola.", destino: "Alunos do ensino médio", canal: "Portal", data: "—", estado: "Rascunho" },
];

/* ------------------------------ Configurações ----------------------------- */

export const configuracaoEscola = {
  nome: "Colégio SIGA",
  nif: "5417238190",
  diretor: "Dr. António Sebastião",
  telefone: "+244 923 000 111",
  email: "geral@onschool.ao",
  endereco: "Rua Amílcar Cabral, 118 · Luanda, Angola",
  anoLectivo: "2024/2025",
  moeda: "Kwanza (Kz)",
  trimestres: 3,
  mediaMinima: 10,
};

export const parametrosFinanceiros = [
  { label: "Mensalidade base", valor: kwanza(45000) },
  { label: "Taxa de matrícula", valor: kwanza(90000) },
  { label: "Multa por atraso", valor: "2% / mês" },
  { label: "Dia de vencimento", valor: "10 de cada mês" },
];
