import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
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
  full?: boolean | undefined;
  required?: boolean | undefined;
  defaultValue?: string | number | undefined;
};

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
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const didAutoOpen = useRef(false);

  useEffect(() => {
    if (!autoOpen || didAutoOpen.current) return;
    didAutoOpen.current = true;
    setOpen(true);
  }, [autoOpen]);

  useEffect(() => {
    if (!open) setDirty(false);
  }, [open]);

  const guardedClose = () => {
    if (confirmDiscardChanges(dirty)) setOpen(false);
  };

  async function submit() {
    if (!formRef.current) return;
    if (!formRef.current.reportValidity()) return;

    const data = new FormData(formRef.current);
    const values: Record<string, string> = {};
    for (const [key, val] of data.entries()) {
      values[key] = String(val ?? "").trim();
    }

    setSaving(true);
    try {
      await onSubmit(values);
      toast.success(title, { description: successDescription });
      setOpen(false);
    } catch (err) {
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
              onChange={() => setDirty(true)}
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
                          className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-xs md:text-sm"
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
                      placeholder={field.placeholder}
                      required={field.required ?? true}
                      defaultValue={field.defaultValue}
                      className="mt-1.5"
                    />
                  )}
                </div>
              ))}
            </form>
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
