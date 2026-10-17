import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { validateAngolaNif } from "@/lib/angola-identity";

type AngolaIdentityFieldProps = {
  id: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
};

/** Campo BI/NIF com validação de formato (Lei n.º 3/21). */
export function AngolaIdentityField({
  id,
  name,
  value,
  defaultValue,
  onChange,
  disabled,
  className,
  placeholder = "BI ou NIF (9–10 dígitos / 14 caracteres)",
}: AngolaIdentityFieldProps) {
  const [hint, setHint] = useState<string | null>(null);

  const readValue = () => {
    if (value !== undefined) return value;
    const element = document.getElementById(id) as HTMLInputElement | null;
    return element?.value ?? defaultValue ?? "";
  };

  const validateFormat = () => {
    const raw = readValue();
    if (!raw.trim()) {
      setHint("Indique o BI ou NIF para validar.");
      toast.error("Preencha o documento.");
      return;
    }
    const result = validateAngolaNif(raw);
    if (!result.ok) {
      setHint(result.error ?? "Documento inválido.");
      toast.error(result.error ?? "Documento inválido.");
      return;
    }
    const message =
      result.kind === "individual"
        ? "BI com formato válido (confirme na AGT)."
        : "NIF de entidade com formato válido.";
    setHint(message);
    toast.success(message);
  };

  return (
    <div className="space-y-2">
      <Input
        id={id}
        name={name}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        disabled={disabled}
        className={className}
        placeholder={placeholder}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={validateFormat}
          disabled={disabled}
        >
          Validar formato
        </Button>
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
