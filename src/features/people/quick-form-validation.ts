import { validateAngolaPhone } from "@/lib/angola-phone";
import { createTeacherInputSchema, updatePersonInputSchema } from "./schemas";

export type QuickFieldErrors = Record<string, string>;

function firstIssues(
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>,
  mapping: Record<string, string>,
): QuickFieldErrors {
  const errors: QuickFieldErrors = {};
  for (const issue of issues) {
    const field = mapping[String(issue.path[0] ?? "")];
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}

function phoneError(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  const checked = validateAngolaPhone(value);
  return checked.ok ? undefined : (checked.error ?? "Telefone inválido.");
}

/** Reutiliza as mesmas regras de nomes/e-mail que o servidor, antes de enviar. */
export function validateTeacherQuickForm(values: Record<string, string>): QuickFieldErrors {
  const result = createTeacherInputSchema.safeParse({
    fullName: values["nome"] ?? "",
    email: values["email"] ?? "",
    phone: values["telefone"] ?? "",
    employeeNumber: values["numero"] ?? "",
    hiredOn: values["contratacao"] ?? "",
  });
  const errors = result.success
    ? {}
    : firstIssues(result.error.issues, {
        fullName: "nome",
        email: "email",
        phone: "telefone",
        employeeNumber: "numero",
        hiredOn: "contratacao",
      });
  const phone = phoneError(values["telefone"]);
  if (phone) errors["telefone"] = phone;
  return errors;
}

/** Edição rápida: não depende de um identificador fictício ou de uma regra paralela. */
export function validatePersonQuickEdit(
  values: Record<string, string>,
  personId: string,
): QuickFieldErrors {
  const result = updatePersonInputSchema.safeParse({
    personId,
    fullName: values["nome"] ?? "",
    email: values["email"] ?? "",
    phone: values["telefone"] ?? "",
    nif: values["nif"] ?? "",
  });
  const errors = result.success
    ? {}
    : firstIssues(result.error.issues, {
        fullName: "nome",
        email: "email",
        phone: "telefone",
        nif: "nif",
      });
  const phone = phoneError(values["telefone"]);
  if (phone) errors["telefone"] = phone;
  return errors;
}
