"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "@/lib/toast";

import { Button } from "@/components/ui/button";
import { PayflowBrandIcon } from "@/features/finance/components/PayflowBrandIcon";
import { syncSchoolBankToPayflow } from "@/features/finance/server";
import { cn } from "@/lib/utils";

type PayflowBankSyncButtonProps = {
  className?: string;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  label?: string;
};

export function PayflowBankSyncButton({
  className,
  variant = "outline",
  size = "default",
  label = "Sync IBAN → PayFlow",
}: PayflowBankSyncButtonProps) {
  const [lastMasked, setLastMasked] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => syncSchoolBankToPayflow(),
    onSuccess: (result) => {
      setLastMasked(result.ibanMasked);
      toast.success(
        result.ibanMasked
          ? `Conta sincronizada no PayFlow (${result.ibanMasked})`
          : "Conta bancária sincronizada no PayFlow.",
      );
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Falha ao sincronizar IBAN com o PayFlow.",
      );
    },
  });

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn("gap-1.5", className)}
      disabled={mutation.isPending}
      onClick={() => mutation.mutate()}
      title={lastMasked ? `Último IBAN: ${lastMasked}` : "Sincronizar IBAN da escola com o PayFlow"}
    >
      {mutation.isPending ? (
        <LoaderCircle className="size-3.5 animate-spin" />
      ) : (
        <PayflowBrandIcon size={14} />
      )}
      {label}
    </Button>
  );
}
