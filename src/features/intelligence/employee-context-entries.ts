import { moduleIcons } from "@/lib/app-icons";
import type { ContextModule } from "./context-modules";
import type { ContextNavEntry } from "./context-registry";
import type { ContextFrame } from "./types";

/**
 * Entradas do contexto Funcionário (contexto RH): a ficha do vínculo laboral, a
 * lista dos funcionários, as páginas do RH onde se trabalha sobre ele (rever
 * faltas, a folha salarial, as alterações salariais) e, quando o servidor devolve
 * o registo de professor da mesma pessoa, o perfil do professor.
 */

function employeeFrame(trail: ContextFrame[]): ContextFrame | undefined {
  return [...trail].reverse().find((frame) => frame.type === "employee");
}

function employeeTeacherId(trail: ContextFrame[]): string | undefined {
  return employeeFrame(trail)?.relations?.teacher;
}

const base = {
  group: "Funcionário",
  contexts: ["employee"],
  module: "financeiro",
} satisfies Partial<ContextNavEntry>;

export const EMPLOYEE_CONTEXT_ENTRIES: readonly ContextNavEntry[] = [
  {
    ...base,
    id: "employee.overview",
    label: "Ficha do funcionário",
    icon: moduleIcons.profile,
    to: "/financeiro/rh/funcionarios/$employmentId",
    path: (trail) => `/financeiro/rh/funcionarios/${employeeFrame(trail)?.id ?? ""}`,
    order: 0,
  },
  {
    ...base,
    id: "employee.list",
    label: "Todos os funcionários",
    icon: moduleIcons.people,
    to: "/financeiro/rh/funcionarios",
    order: 10,
  },
  {
    ...base,
    id: "employee.absences",
    label: "Rever faltas",
    icon: moduleIcons.staffAbsences,
    group: "Recursos Humanos",
    to: "/financeiro/rh/faltas",
    order: 20,
  },
  {
    ...base,
    id: "employee.payroll",
    label: "Folha salarial",
    icon: moduleIcons.payouts,
    group: "Recursos Humanos",
    to: "/financeiro/rh/folha",
    order: 30,
  },
  {
    ...base,
    id: "employee.salary",
    label: "Alterações salariais",
    icon: moduleIcons.hr,
    group: "Recursos Humanos",
    to: "/financeiro/rh/salarios",
    order: 40,
  },
  {
    id: "employee.teacher",
    label: "Perfil do professor",
    icon: moduleIcons.classes,
    group: "Professor",
    contexts: ["employee"],
    to: "/professores/$teacherId",
    path: (trail) => `/professores/${employeeTeacherId(trail) ?? ""}`,
    module: "pessoas",
    available: (trail) => Boolean(employeeTeacherId(trail)),
    order: 50,
  },
];

export const EMPLOYEE_CONTEXT_MODULE: ContextModule = {
  kinds: { employee: "Funcionário" },
  entries: EMPLOYEE_CONTEXT_ENTRIES,
  // O RH é da Administração e da Tesouraria (`requireHrReader`), só pelo cargo.
  menuRoles: ["Administrador", "Tesouraria"],
  back: () => ({ to: "/financeiro/rh/funcionarios" }),
};
