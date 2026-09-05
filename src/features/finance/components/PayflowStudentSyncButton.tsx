"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { PayflowBrandIcon } from "@/features/finance/components/PayflowBrandIcon";
import { syncStudentToPayflow } from "@/features/finance/server";
import { cn } from "@/lib/utils";

type PayflowStudentSyncButtonProps = {
  studentId: string;
  className?: string;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
};

export function PayflowStudentSyncButton({
  studentId,
  className,
  variant = "outline",
  size = "sm",
}: PayflowStudentSyncButtonProps) {
  const [lastCode, setLastCode] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => syncStudentToPayflow({ data: { studentId } }),
    onSuccess: (result) => {
      setLastCode(result.studentCode);
      toast.success(
        `PayFlow sincronizado · código ${result.studentCode} · ${result.invoicesSynced} fatura(s)`,
      );
      if (result.warning) toast.message(result.warning);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Falha ao sincronizar com o PayFlow.");
    },
  });

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn("gap-1.5", className)}
      disabled={mutation.isPending || !studentId}
      onClick={() => mutation.mutate()}
      title={lastCode ? `Último código PayFlow: ${lastCode}` : "Sincronizar aluno com o PayFlow"}
    >
      {mutation.isPending ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <PayflowBrandIcon size={14} />
      )}
      Sync PayFlow
    </Button>
  );
}
