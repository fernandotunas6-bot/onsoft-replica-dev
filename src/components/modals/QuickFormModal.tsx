import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { PremiumModal } from "@/components/ui/premium-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type QuickField = {
  name: string;
  label: string;
  placeholder?: string;
  type?: "text" | "number" | "date" | "textarea" | "select";
  options?: string[];
  full?: boolean;
};

/**
 * Modal premium de criação/edição rápida. Os dados ficam associados
 * apenas de demonstração.
 */
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
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = () => {
    setSaving(true);
    window.setTimeout(() => {
      setSaving(false);
      setOpen(false);
      toast.success(`${title} concluído`, {
        description: "Registo guardado com sucesso.",
      });
    }, 550);
  };

  return (
    <>
      {trigger(() => setOpen(true))}
      <PremiumModal
        open={open}
        onOpenChange={setOpen}
        eyebrow={eyebrow ?? tenant.nome}
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
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((field) => (
            <div key={field.name} className={field.full ? "sm:col-span-2" : undefined}>
              <Label htmlFor={field.name} className="text-xs font-semibold">
                {field.label}
              </Label>
              {field.type === "textarea" ? (
                <Textarea id={field.name} placeholder={field.placeholder} className="mt-1.5" />
              ) : field.type === "select" ? (
                <select
                  id={field.name}
                  className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  defaultValue={field.options?.[0]}
                >
                  {(field.options ?? []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id={field.name}
                  type={field.type ?? "text"}
                  placeholder={field.placeholder}
                  className="mt-1.5"
                />
              )}
            </div>
          ))}
        </div>
        {note ? <p className="mt-4 text-xs text-muted-foreground">{note}</p> : null}
      </PremiumModal>
    </>
  );
}
