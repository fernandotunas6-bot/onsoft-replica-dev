"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

export interface LocalFilePickerProps {
  onSelect: (files: File[]) => void | Promise<void>;
  onError?: (message: string) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  maxBytes?: number;
  label?: string;
  className?: string;
}

/**
 * Native browser file picker. It deliberately does not upload or grant access to
 * stored files: callers must validate and authorize server-side before persisting.
 */
export function LocalFilePicker({
  onSelect,
  onError,
  accept,
  multiple = false,
  disabled = false,
  maxBytes,
  label = "Escolher ficheiro",
  className,
}: LocalFilePickerProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);

  const handleChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const selected = Array.from(input.files ?? []);
    input.value = "";
    if (selected.length === 0) return;
    if (maxBytes != null && selected.some((file) => file.size > maxBytes)) {
      onError?.("Um ou mais ficheiros ultrapassam o tamanho permitido.");
      return;
    }
    setBusy(true);
    try {
      await onSelect(selected);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "Não foi possível seleccionar o ficheiro.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled || busy}
        className="sr-only"
        tabIndex={-1}
        aria-label={label}
        onChange={handleChange}
      />
      <Button
        type="button"
        className={className}
        disabled={disabled || busy}
        loading={busy}
        onClick={() => inputRef.current?.click()}
      >
        {label}
      </Button>
    </>
  );
}
