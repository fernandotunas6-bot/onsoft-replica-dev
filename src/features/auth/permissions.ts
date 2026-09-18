import type { ApplicationRole, ModuleGrantMap } from "./access-policy";

export const standardPermissions = [
  // Estudantes e Matrículas
  "students.read",
  "students.create",
  "students.update",
  "students.archive",
  "enrollments.read",
  "enrollments.create",
  "enrollments.approve",
  "enrollments.cancel",

  // Pedagógico e Avaliações
  "grades.read",
  "grades.create",
  "grades.update",
  "grades.publish",
  "grades.lock",
  "attendance.read",
  "attendance.manage",
  "attendance.justify",
  "lesson_plans.read",
  "lesson_plans.manage",
  "schedule.read",
  "schedule.manage",

  // Tesouraria e Finanças
  "finance.read",
  "finance.invoice",
  "finance.payment",
  "finance.refund",
  "finance.plans",
  "finance.export_saft",

  // Documentos e Secretaria
  "documents.read",
  "documents.issue",
  "documents.verify",

  // Biblioteca de Arquivos
  "files.read",
  "files.upload",
  "files.manage_system",
  "files.delete",

  // Comunicações e Mensagens
  "announcements.read",
  "announcements.create",
  "announcements.publish",
  "messages.send",

  // Controlo de Acessos e Catracas
  "turnstiles.read",
  "turnstiles.manage",
  "turnstiles.relay",

  // Gestão Institucional e Pessoal
  "staff.read",
  "staff.manage",
  "access.read",
  "access.manage",
  "access.invite",
  "school.settings.read",
  "school.settings.update",
  "school.roles.manage",
  "import.execute",
] as const;

export type StandardPermission = (typeof standardPermissions)[number];

export const roleDefaultPermissions: Record<ApplicationRole, readonly StandardPermission[]> = {
  Administrador: standardPermissions, // Acesso total
  Secretaria: [
    "students.read",
    "students.create",
    "students.update",
    "students.archive",
    "enrollments.read",
    "enrollments.create",
    "enrollments.approve",
    "enrollments.cancel",
    "grades.read",
    "grades.update",
    "attendance.read",
    "attendance.manage",
    "attendance.justify",
    "documents.read",
    "documents.issue",
    "documents.verify",
    "files.read",
    "files.upload",
    "files.manage_system",
    "announcements.read",
    "announcements.create",
    "announcements.publish",
    "messages.send",
    "turnstiles.read",
    "turnstiles.manage",
    "staff.read",
    "access.read",
    "access.manage",
    "access.invite",
    "import.execute",
  ],
  Tesouraria: [
    "students.read",
    "finance.read",
    "finance.invoice",
    "finance.payment",
    "finance.refund",
    "finance.plans",
    "finance.export_saft",
    "documents.read",
    "files.read",
    "files.upload",
    "files.manage_system",
    "announcements.read",
    "messages.send",
    "import.execute",
  ],
  Professor: [
    "students.read",
    "grades.read",
    "grades.create",
    "grades.update",
    "attendance.read",
    "attendance.manage",
    "lesson_plans.read",
    "lesson_plans.manage",
    "schedule.read",
    "files.read",
    "files.upload",
    "announcements.read",
    "announcements.create",
    "messages.send",
  ],
  Encarregado: [
    "students.read",
    "grades.read",
    "attendance.read",
    "schedule.read",
    "finance.read",
    "finance.payment",
    "documents.read",
    "files.read",
    "announcements.read",
    "messages.send",
  ],
  Aluno: [
    "grades.read",
    "attendance.read",
    "schedule.read",
    "finance.read",
    "documents.read",
    "files.read",
    "announcements.read",
    "messages.send",
  ],
  Utilizador: ["files.read", "announcements.read"],
};

/**
 * Verifica se um papel ou conjunto de papéis possui a permissão requerida.
 */
export function hasPermission(
  roles: ApplicationRole | ApplicationRole[],
  permission: StandardPermission,
  grants: ModuleGrantMap = {},
): boolean {
  const roleList = Array.isArray(roles) ? roles : [roles];
  if (roleList.includes("Administrador")) return true;

  // Verifica permissão por módulo via grants
  const moduleMap: Record<string, keyof typeof grants> = {
    students: "pessoas",
    enrollments: "pessoas",
    grades: "pedagogica",
    attendance: "pedagogica",
    lesson_plans: "pedagogica",
    schedule: "pedagogica",
    finance: "financeiro",
    documents: "pessoas",
    files: "arquivos",
    turnstiles: "gestao",
    access: "gestao",
    import: "importacao",
  };

  const [prefix] = permission.split(".");
  if (prefix && moduleMap[prefix]) {
    const grantLevel = grants[moduleMap[prefix]];
    if (grantLevel === "Nenhum") return false;
    if (grantLevel === "Total") return true;
    if (
      grantLevel === "Escrita" &&
      !permission.endsWith(".delete") &&
      !permission.endsWith(".archive")
    ) {
      return true;
    }
    if (grantLevel === "Leitura" && permission.endsWith(".read")) {
      return true;
    }
  }

  // Verifica conjunto de permissões do papel padrão
  return roleList.some((role) => roleDefaultPermissions[role]?.includes(permission));
}

/**
 * Validação de contexto de autorização (Ex: Professor só lança nota para a sua turma).
 */
export interface ContextualAccessParams {
  userId: string;
  role: ApplicationRole;
  schoolId: string;
  targetSchoolId: string;
  teacherAssignedClassIds?: string[];
  targetClassId?: string;
  guardianLinkedStudentIds?: string[];
  targetStudentId?: string;
}

export function canAccessContext(params: ContextualAccessParams): {
  allowed: boolean;
  reason?: string;
} {
  // 1. Barreira de Tenant: school_id deve coincidir
  if (params.schoolId !== params.targetSchoolId) {
    return { allowed: false, reason: "Acesso negado: escola diferente da sessão activa." };
  }

  // 2. Administradores e Secretaria têm acesso amplo na mesma escola
  if (params.role === "Administrador" || params.role === "Secretaria") {
    return { allowed: true };
  }

  // 3. Regra contextual de Professor (Turmas atribuídas)
  if (params.role === "Professor" && params.targetClassId) {
    if (
      params.teacherAssignedClassIds &&
      !params.teacherAssignedClassIds.includes(params.targetClassId)
    ) {
      return { allowed: false, reason: "Acesso negado: turma não atribuída ao docente." };
    }
  }

  // 4. Regra contextual de Encarregado (Filhos / Educandos vinculados)
  if (params.role === "Encarregado" && params.targetStudentId) {
    if (
      params.guardianLinkedStudentIds &&
      !params.guardianLinkedStudentIds.includes(params.targetStudentId)
    ) {
      return { allowed: false, reason: "Acesso negado: educando não vinculado ao encarregado." };
    }
  }

  return { allowed: true };
}
