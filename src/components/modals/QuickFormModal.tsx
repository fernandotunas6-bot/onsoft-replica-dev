import { reportPossibleStepUp } from "@/lib/step-up";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "@/lib/toast";
import { ModalShell, ModalHeader, ModalContent, ModalFooter } from "@/components/ui/modal-system";
import { confirmDiscardChanges } from "@/components/ui/modal-system/confirm-close";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableNativeSelect } from "@/components/forms/SearchableNativeSelect";
import { AngolaIdentityField } from "@/components/forms/AngolaIdentityField";

type QuickOptions = string[] | { value: string; label: string }[];

export type QuickField = {
  name: string;
  label: string;
  placeholder?: string | undefined;
  type?:
    "text" | "number" | "date" | "time" | "textarea" | "select" | "angola-identity" | "password";
  options?: QuickOptions | undefined;
  /** Opt-in text filter; the selected value is preserved while searching. */
  searchable?: boolean;
  /**
   * Opções que dependem do que já está escolhido noutros campos (ex.: as disciplinas
   * da turma do aluno). Substitui `options`; ao mudarem, o campo volta à primeira.
   */
  optionsFor?: ((values: Record<string, string>) => QuickOptions) | undefined;
  /**
   * Teclado do telemóvel (§28). Deixar em branco na maioria dos casos: o
   * `inferInputMode` abaixo acerta a partir do tipo e do nome do campo. Só vale
   * a pena fixar aqui quando o nome do campo não diz o que se escreve nele.
   */
  inputMode?: "text" | "numeric" | "decimal" | "tel" | "email" | "url" | "search" | undefined;
  full?: boolean | undefined;
  required?: boolean | undefined;
  defaultValue?: string | number | undefined;
  /** Sugestões enquanto se escreve (lista nativa: teclado e telemóvel). Só campos de texto. */
  suggestions?: readonly string[] | undefined;
};

/**
 * Que teclado abrir para cada campo (§28).
 *
 * Num telemóvel, escrever um número de telefone com o teclado alfabético é
 * quatro toques a mais por dígito, e um valor em kwanzas sem tecla de vírgula
 * obriga a mudar de painel. O tipo do campo não chega para decidir — quase tudo
 * neste formulário é `text` —, por isso o nome e o rótulo também contam.
 *
 * Fica deliberadamente conservador: quando não reconhece o campo devolve
 * `undefined` e o browser decide, que é melhor do que forçar um teclado errado.
 */
function inferInputMode(field: QuickField): QuickField["inputMode"] {
  if (field.inputMode) return field.inputMode;
  if (field.type === "number") return "decimal";
  const hint = `${field.name} ${field.label}`.toLowerCase();
  if (/(telefone|telem|celular|contacto|phone|whatsapp)/.test(hint)) return "tel";
  if (/(email|e-mail)/.test(hint)) return "email";
  if (/(valor|montante|preço|preco|kz|kwanza|salário|salario|propina|taxa)/.test(hint))
    return "decimal";
  if (/(nif|bi\b|número|numero|quantidade|capacidade|nº)/.test(hint)) return "numeric";
  return undefined;
}

/** Modal de criação e edição rápida com validação nativa dos campos. */
export function QuickFormModal({
  trigger,
  eyebrow,
  title,
  description,
  icon,
  fields,
  submitLabel = "Guardar",
  size = "md",
  note,
  onSubmit,
  autoOpen = false,
  successDescription = "Registo guardado com sucesso.",
  renderHint,
  validate,
}: {
  trigger: (open: () => void) => ReactNode;
  eyebrow?: string | undefined;
  title: string;
  description?: string | undefined;
  icon?: ReactNode | undefined;
  fields: QuickField[];
  submitLabel?: string;
  size?: "sm" | "md" | "lg" | undefined;
  note?: string | undefined;
  /** Mutação real executada ao submeter o formulário. */
  onSubmit: (values: Record<string, string>) => Promise<void>;
  /** Abre o modal automaticamente (ex.: deep-link da sidebar). */
  autoOpen?: boolean;
  successDescription?: string;
  /** Aviso calculado a partir do que está escrito (ex.: «já existe»), por baixo dos campos. */
  renderHint?: (values: Record<string, string>) => ReactNode;
  /** Validação por campo antes da mutação, sem apagar os valores submetidos. */
  validate?: (values: Record<string, string>) => Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const didAutoOpen = useRef(false);
  // Guarda síncrona: o botão só fica desactivado depois de o React voltar a desenhar,
  // e dois cliques no mesmo instante enviavam duas vezes (dois recibos do mesmo
  // pagamento parcial, por exemplo).
  const inFlight = useRef(false);
  const tracksValues = Boolean(renderHint) || fields.some((field) => field.optionsFor);

  useEffect(() => {
    if (!autoOpen || didAutoOpen.current) return;
    didAutoOpen.current = true;
    setOpen(true);
  }, [autoOpen]);

  useEffect(() => {
    if (!open) {
      setDirty(false);
      setValues({});
      setFieldErrors({});
      setSubmitError(false);
    }
  }, [open]);

  const readValues = () => {
    const out: Record<string, string> = {};
    if (!formRef.current) return out;
    for (const [key, val] of new FormData(formRef.current).entries()) {
      out[key] = String(val ?? "").trim();
    }
    return out;
  };

  const guardedClose = () => {
    if (inFlight.current) return;
    if (confirmDiscardChanges(dirty)) setOpen(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && inFlight.current) return;
    setOpen(next);
  };

  async function submit() {
    if (!formRef.current) return;
    if (!formRef.current.reportValidity()) return;

    if (inFlight.current) return;
    const submittedValues = readValues();
    const errors = validate?.(submittedValues) ?? {};
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      const first = formRef.current.elements.namedItem(Object.keys(errors)[0]!);
      if (first instanceof HTMLElement) first.focus();
      return;
    }
    inFlight.current = true;
    setSubmitError(false);
    setSaving(true);
    try {
      await onSubmit(submittedValues);
      toast.success(title, { description: successDescription });
      setOpen(false);
    } catch (err) {
      setSubmitError(true);
      // Acção protegida: abre «Confirme que é você» em vez de um erro.
      if (reportPossibleStepUp(err)) return;
      toast.error("Erro ao guardar", {
        description: err instanceof Error ? err.message : "Ocorreu uma falha ao guardar.",
      });
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <>
      {trigger(() => setOpen(true))}

      <ModalShell open={open} onOpenChange={handleOpenChange} size={size} hasUnsavedChanges={dirty}>
        <div className="flex flex-col h-full">
          <ModalHeader title={title} subtitle={description ?? eyebrow} onClose={guardedClose} />
          <ModalContent>
            {submitError ? (
              <p role="alert" className="mb-3 text-sm text-destructive">
                Não foi possível guardar. Os dados introduzidos foram mantidos para nova tentativa.
              </p>
            ) : null}
            <form
              ref={formRef}
              className="grid gap-3 sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
              onChange={(event) => {
                setDirty(true);
                const target = event.target;
                const name =
                  target instanceof HTMLInputElement ||
                  target instanceof HTMLSelectElement ||
                  target instanceof HTMLTextAreaElement
                    ? target.name
                    : "";
                if (name) {
                  setFieldErrors((previous) => {
                    if (!previous[name]) return previous;
                    const next = { ...previous };
                    delete next[name];
                    return next;
                  });
                }
                setSubmitError(false);
                if (tracksValues) setValues(readValues());
              }}
            >
              {fields.map((field) => (
                <div key={field.name} className={field.full ? "sm:col-span-2" : undefined}>
                  <Label htmlFor={field.name} className="text-xs font-semibold">
                    {field.label}
                  </Label>
                  {field.type === "textarea" ? (
                    <Textarea
                      id={field.name}
                      name={field.name}
                      placeholder={field.placeholder}
                      required={field.required ?? true}
                      aria-invalid={Boolean(fieldErrors[field.name])}
                      aria-describedby={fieldErrors[field.name] ? `${field.name}-error` : undefined}
                      defaultValue={field.defaultValue}
                      className="mt-1"
                    />
                  ) : field.type === "select" ? (
                    (() => {
                      const normalizedOptions = (
                        (field.optionsFor ? field.optionsFor(values) : field.options) ?? []
                      ).map((option) =>
                        typeof option === "string" ? { value: option, label: option } : option,
                      );
                      if (field.searchable) {
                        return (
                          <SearchableNativeSelect
                            key={
                              field.optionsFor
                                ? normalizedOptions.map((option) => option.value).join("\u0000")
                                : undefined
                            }
                            id={field.name}
                            name={field.name}
                            label={field.label}
                            options={normalizedOptions}
                            required={field.required ?? true}
                            invalid={Boolean(fieldErrors[field.name])}
                            errorId={fieldErrors[field.name] ? `${field.name}-error` : undefined}
                            placeholder={field.placeholder}
                            defaultValue={String(
                              field.defaultValue ??
                                (field.placeholder || field.required === false
                                  ? ""
                                  : (normalizedOptions[0]?.value ?? "")),
                            )}
                          />
                        );
                      }
                      return (
                        <select
                          // Opções novas: monta de novo, para não ficar um valor que já não está na lista.
                          key={
                            field.optionsFor
                              ? normalizedOptions.map((option) => option.value).join("\u0000")
                              : undefined
                          }
                          id={field.name}
                          name={field.name}
                          required={field.required ?? true}
                          aria-invalid={Boolean(fieldErrors[field.name])}
                          aria-describedby={
                            fieldErrors[field.name] ? `${field.name}-error` : undefined
                          }
                          className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm md:h-9 md:text-sm"
                          defaultValue={
                            field.defaultValue ??
                            (field.required === false ? "" : (normalizedOptions[0]?.value ?? ""))
                          }
                        >
                          {field.required === false ? <option value="">—</option> : null}
                          {normalizedOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      );
                    })()
                  ) : field.type === "angola-identity" ? (
                    <AngolaIdentityField
                      id={field.name}
                      name={field.name}
                      defaultValue={field.defaultValue != null ? String(field.defaultValue) : ""}
                      disabled={false}
                      ariaInvalid={Boolean(fieldErrors[field.name])}
                      errorId={fieldErrors[field.name] ? `${field.name}-error` : undefined}
                      placeholder={field.placeholder ?? ""}
                      className="mt-1.5"
                    />
                  ) : (
                    <Input
                      id={field.name}
                      name={field.name}
                      type={field.type ?? "text"}
                      {...(inferInputMode(field) ? { inputMode: inferInputMode(field) } : {})}
                      placeholder={field.placeholder}
                      required={field.required ?? true}
                      aria-invalid={Boolean(fieldErrors[field.name])}
                      aria-describedby={fieldErrors[field.name] ? `${field.name}-error` : undefined}
                      defaultValue={field.defaultValue}
                      className="mt-1.5"
                      {...(field.suggestions?.length ? { list: `${field.name}-suggestions` } : {})}
                    />
                  )}
                  {fieldErrors[field.name] ? (
                    <p
                      id={`${field.name}-error`}
                      role="alert"
                      className="mt-1 text-xs text-destructive"
                    >
                      {fieldErrors[field.name]}
                    </p>
                  ) : null}
                  {field.suggestions?.length ? (
                    <datalist id={`${field.name}-suggestions`}>
                      {field.suggestions.map((option) => (
                        <option key={option} value={option} />
                      ))}
                    </datalist>
                  ) : null}
                </div>
              ))}
            </form>
            {renderHint ? (
              <div aria-live="polite" className="mt-3 empty:hidden">
                {renderHint(values)}
              </div>
            ) : null}
            {note ? <p className="mt-4 text-xs text-muted-foreground">{note}</p> : null}
          </ModalContent>
          <ModalFooter
            onCancel={guardedClose}
            onSubmit={submit}
            submitLabel={submitLabel}
            isSubmitting={saving}
          />
        </div>
      </ModalShell>
    </>
  );
}
