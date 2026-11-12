import { useState } from "react";
import { CheckSquare2, Copy, Download, Mail, ShieldOff, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { reportPossibleStepUp } from "@/lib/step-up";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportCsv } from "@/lib/export-csv";
import { listSystemAccounts, setSystemAccountDisabled } from "@/features/access/server";

type Account = Awaited<ReturnType<typeof listSystemAccounts>>[number];

export function AccountBulkActions({
  accounts,
  selectedIds,
  isAdministrator,
  onChanged,
  onClear,
}: {
  accounts: Account[];
  selectedIds: string[];
  isAdministrator: boolean;
  onChanged: () => Promise<unknown>;
  onClear: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const selected = accounts.filter((item) => selectedIds.includes(item.id));
  if (!selected.length) return null;
  const rows = selected.map((item) => ({
    name: item.full_name,
    email: item.email ?? "",
    cargo: item.cargo,
    status: item.disabled ? "Bloqueado" : "Activo",
  }));
  const exportSelected = () =>
    exportCsv(
      "contas-seleccionadas",
      [
        { label: "Nome", value: (row: (typeof rows)[number]) => row.name },
        { label: "E-mail", value: (row: (typeof rows)[number]) => row.email },
        { label: "Cargo", value: (row: (typeof rows)[number]) => row.cargo },
        { label: "Estado", value: (row: (typeof rows)[number]) => row.status },
      ],
      rows,
    );
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        selected
          .map((item) => [item.full_name, item.email, item.cargo].filter(Boolean).join(" — "))
          .join("\n"),
      );
      toast.success(`${selected.length} conta(s) copiadas.`);
    } catch {
      toast.error("Não foi possível copiar a lista.");
    }
  };
  const email = () => {
    const addresses = [
      ...new Set(
        selected.map((item) => item.email).filter((value): value is string => Boolean(value)),
      ),
    ];
    if (!addresses.length) {
      toast.warning("Os seleccionados não têm e-mail disponível.");
      return;
    }
    if (addresses.length > 20) {
      toast.warning("Para proteger a privacidade, envie e-mails em lotes de até 20 destinatários.");
      return;
    }
    window.location.href = `mailto:?bcc=${encodeURIComponent(addresses.join(","))}&subject=${encodeURIComponent("Comunicação institucional · SIGA Plus")}`;
  };
  const suspend = async () => {
    const target = selected.filter((item) => !item.is_self && !item.disabled);
    if (!target.length) return;
    if (target.length > 25) {
      toast.error("Seleccione no máximo 25 contas por operação.");
      return;
    }
    if (
      !window.confirm(
        `Suspender o acesso de ${target.length} conta(s) nesta escola? Os registos não serão apagados.`,
      )
    )
      return;
    setBusy(true);
    let success = 0;
    const failed: string[] = [];
    for (const item of target) {
      try {
        await setSystemAccountDisabled({ data: { userId: item.id, disabled: true } });
        success++;
      } catch (error) {
        if (reportPossibleStepUp(error)) {
          toast.warning("Confirme a sua identidade e repita a operação.");
          break;
        }
        failed.push(item.full_name);
      }
    }
    try {
      await onChanged();
    } catch {
      toast.warning("Actualize a página para ver os resultados.");
    }
    setBusy(false);
    onClear();
    if (success) toast.success(`${success} conta(s) suspensas.`);
    if (failed.length) toast.error(`${failed.length} falha(s): ${failed.slice(0, 3).join(", ")}.`);
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/25 bg-primary-soft/50 px-3 py-2">
      <div className="flex items-center gap-2 text-xs font-medium">
        <CheckSquare2 className="size-4 text-primary" />
        {selected.length} {selected.length === 1 ? "conta seleccionada" : "contas seleccionadas"}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" disabled={busy}>
              Acções dos seleccionados
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-52">
            <DropdownMenuItem onSelect={() => void copy()}>
              <Copy className="mr-2 size-4" /> Copiar lista
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={exportSelected}>
              <Download className="mr-2 size-4" /> Exportar seleccionados (CSV)
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={email}>
              <Mail className="mr-2 size-4" /> Preparar e-mail (BCC)
            </DropdownMenuItem>
            {isAdministrator ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => void suspend()}
                  className="text-destructive-strong"
                >
                  <ShieldOff className="mr-2 size-4" /> Suspender acessos…
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button type="button" size="sm" variant="ghost" onClick={onClear} disabled={busy}>
          <X className="mr-1 size-4" /> Desmarcar
        </Button>
      </div>
    </div>
  );
}
