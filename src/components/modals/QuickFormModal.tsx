import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { PremiumModal } from "@/components/ui/premium-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AngolaIdentityField } from "@/components/forms/AngolaIdentityField";

export type QuickField = {
  name: string;
  label: string;
  placeholder?: string;
  type?: "text" | "number" | "date" | "textarea" | "select" | "angola-identity";
  options?: string[];
  full?: boolean;
  required?: boolean;
  defaultValue?: string | number;
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
  /** Quando fornecido, substitui o guardar simulado por uma mutação real. */
  onSubmit?: (values: Record<string, string>) => Promise<void>;
  /** Abre o modal automaticamente (ex.: deep-link da sidebar). */
  autoOpen?: boolean;
  successDescription?: string;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const didAutoOpen = useRef(false);

  useEffect(() => {
    if (!autoOpen || didAutoOpen.current) return;
    didAutoOpen.current = true;
    setOpen(true);
  }, [autoOpen]);

  const submit = async () => {
    if (!formRef.current?.reportValidity()) return;
    setSaving(true);
    try {
      if (!onSubmit) {
        throw new Error("Esta acção ainda não está disponível neste módulo.");
      }
      const values = Object.fromEntries(new FormData(formRef.current).entries()) as Record<
        string,
        string
      >;
      await onSubmit(values);
      setOpen(false);
      formRef.current?.reset();
      toast.success(`${title} concluído`, {
        description: successDescription,
      });
    } catch (error) {
      toast.error("Não foi possível guardar", {
        description: error instanceof Error ? error.message : "Tenta novamente.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {trigger(() => setOpen(true))}
      <PremiumModal
        open={open}
        onOpenChange={setOpen}
        eyebrow={eyebrow}
        title={title}
        description={description}
        icon={icon}
        size={size}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? "A guardar…" : submitLabel}
            </Button>
          </>
        }
      >
        <form
          ref={formRef}
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => event.preventDefault()}
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
                  className="mt-1.5"
                />
              ) : field.type === "select" ? (
                <select
                  id={field.name}
                  name={field.name}
                  required={field.required ?? true}
                  className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  defaultValue={
                    field.defaultValue ??
                    (field.required === false ? "" : (field.options?.[0] ?? ""))
                  }
                >
                  {field.required === false ? <option value="">—</option> : null}
                  {(field.options ?? []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : field.type === "angola-identity" ? (
                <AngolaIdentityField
                  id={field.name}
                  name={field.name}
                  defaultValue={field.defaultValue != null ? String(field.defaultValue) : undefined}
                  disabled={false}
                  placeholder={field.placeholder}
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
      </PremiumModal>
    </>
  );
}
