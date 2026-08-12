import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  lookupAngolaBiOnline,
  validateAngolaBi,
  validateAngolaNif,
} from "@/lib/angola-identity";

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

/** Campo BI/NIF com validação de formato e consulta opcional à API pública de BI. */
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
  const [checking, setChecking] = useState(false);
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

  const validateOnline = async () => {
    const raw = readValue();
    const bi = validateAngolaBi(raw);
    if (!bi.ok) {
      toast.error("A validação online só está disponível para BI (14 caracteres).");
      return;
    }
    setChecking(true);
    try {
      const result = await lookupAngolaBiOnline(raw);
      setHint(result.message);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    } finally {
      setChecking(false);
    }
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void validateOnline()}
          disabled={disabled || checking}
        >
          {checking ? (
            <>
              <Loader2 className="mr-1 size-3.5 animate-spin" /> A consultar…
            </>
          ) : (
            "Validar BI online"
          )}
        </Button>
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
