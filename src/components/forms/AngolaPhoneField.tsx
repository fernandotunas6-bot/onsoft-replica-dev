import { useState } from "react";
import { Input } from "@/components/ui/input";
import { formatAngolaPhone, validateAngolaPhone } from "@/lib/angola-phone";
import { whatsappHref } from "@/features/integrations/actions";

type AngolaPhoneFieldProps = {
  id: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
};

/**
 * Campo de telefone angolano (+244 9XX XXX XXX).
 * Mostra o número formatado e link WhatsApp quando a integração estiver instalada.
 */
export function AngolaPhoneField({
  id,
  name,
  value,
  defaultValue,
  onChange,
  disabled,
  className,
  placeholder = "+244 9XX XXX XXX",
}: AngolaPhoneFieldProps) {
  const [hint, setHint] = useState<{ ok: boolean; text: string } | null>(null);

  const currentValue = value ?? defaultValue ?? "";
  const validation = currentValue ? validateAngolaPhone(currentValue) : null;
  const formatted = validation?.ok ? formatAngolaPhone(currentValue) : null;

  const handleChange = (next: string) => {
    onChange?.(next);
    if (!next.trim()) {
      setHint(null);
      return;
    }
    const result = validateAngolaPhone(next);
    setHint(
      result.ok
        ? { ok: true, text: `Formato válido: ${formatAngolaPhone(next)}` }
        : { ok: false, text: result.error ?? "Telefone inválido." },
    );
  };

  return (
    <div className="space-y-1.5">
      <Input
        id={id}
        name={name}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange ? (e) => handleChange(e.target.value) : undefined}
        disabled={disabled}
        className={className}
        placeholder={placeholder}
        type="tel"
        inputMode="tel"
      />
      {hint ? (
        <p
          className={
            hint.ok ? "text-xs text-muted-foreground" : "text-xs font-medium text-destructive"
          }
        >
          {hint.text}
        </p>
      ) : null}
      {(formatted ?? (validation?.ok ? currentValue : null)) ? (
        <a
          href={whatsappHref(formatted ?? currentValue)}
          target="_blank"
          rel="noreferrer"
          className="inline-block text-[11px] font-semibold text-primary hover:underline"
        >
          Abrir WhatsApp
        </a>
      ) : null}
    </div>
  );
}
