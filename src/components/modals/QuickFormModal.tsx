import { reportPossibleStepUp } from "@/lib/step-up";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "@/lib/toast";
import { ModalShell, ModalHeader, ModalContent, ModalFooter } from "@/components/ui/modal-system";
import { confirmDiscardChanges } from "@/components/ui/modal-system/confirm-close";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AngolaIdentityField } from "@/components/forms/AngolaIdentityField";

export type QuickField = {
  name: string;
  label: string;
  placeholder?: string | undefined;
  type?:
    "text" | "number" | "date" | "time" | "textarea" | "select" | "angola-identity" | "password";
  options?: string[] | { value: string; label: string }[] | undefined;
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
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);
  const didAutoOpen = useRef(false);

  useEffect(() => {
    if (!autoOpen || didAutoOpen.current) return;
    didAutoOpen.current = true;
    setOpen(true);
  }, [autoOpen]);

  useEffect(() => {
    if (!open) {
      setDirty(false);
      setValues({});
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
    if (confirmDiscardChanges(dirty)) setOpen(false);
  };

  async function submit() {
    if (!formRef.current) return;
    if (!formRef.current.reportValidity()) return;

    const values = readValues();

    setSaving(true);
    try {
      await onSubmit(values);
      toast.success(title, { description: successDescription });
      setOpen(false);
    } catch (err) {
      // Acção protegida: abre «Confirme que é você» em vez de um erro.
      if (reportPossibleStepUp(err)) return;
      toast.error("Erro ao guardar", {
        description: err instanceof Error ? err.message : "Ocorreu uma falha ao guardar.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {trigger(() => setOpen(true))}

      <ModalShell open={open} onOpenChange={setOpen} size={size} hasUnsavedChanges={dirty}>
        <div className="flex flex-col h-full">
          <ModalHeader title={title} subtitle={description ?? eyebrow} onClose={guardedClose} />
          <ModalContent>
            <form
              ref={formRef}
              className="grid gap-3 sm:grid-cols-2"
              onSubmit={(event) => event.preventDefault()}
              onChange={() => {
                setDirty(true);
                if (renderHint) setValues(readValues());
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
                      defaultValue={field.defaultValue}
                      className="mt-1"
                    />
                  ) : field.type === "select" ? (
                    (() => {
                      const normalizedOptions = (field.options ?? []).map((option) =>
                        typeof option === "string" ? { value: option, label: option } : option,
                      );
                      return (
                        <select
                          id={field.name}
                          name={field.name}
                          required={field.required ?? true}
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
                      defaultValue={field.defaultValue}
                      className="mt-1.5"
                      {...(field.suggestions?.length ? { list: `${field.name}-suggestions` } : {})}
                    />
                  )}
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
