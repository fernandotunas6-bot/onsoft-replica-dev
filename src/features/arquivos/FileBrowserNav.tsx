import { FolderOpen, HardDrive, Lock, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fileAreaMeta, type FileArea } from "./kinds";

const repoIcon = {
  escola: FolderOpen,
  secretaria: Lock,
  pessoal: HardDrive,
  publico: Users,
} as const;

export function FileBrowserNav({
  areas,
  area,
  driveOn,
  onSelectArea,
}: {
  areas: readonly FileArea[];
  area: FileArea;
  driveOn: boolean;
  onSelectArea: (area: FileArea) => void;
}) {
  return (
    <aside className="border-b border-border bg-secondary/40 p-3 md:border-b-0 md:border-r">
      <p className="px-2 pb-2 pt-1 text-[11px] font-bold text-muted-foreground">Repositórios</p>
      <nav className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
        {areas.map((item) => {
          const Icon = repoIcon[item];
          const meta = fileAreaMeta[item];
          const active = item === area;
          return (
            <button
              key={item}
              type="button"
              onClick={() => onSelectArea(item)}
              className={cn(
                "flex min-w-max items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors",
                active ? "bg-primary-soft text-primary" : "text-foreground hover:bg-secondary",
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="min-w-0">
                <span className="block truncate">{meta.label}</span>
                {meta.reserved ? (
                  <span className="block text-[10px] font-semibold text-muted-foreground">
                    Reservado
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </nav>
      <button
        type="button"
        className="mt-3 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-muted-foreground hover:bg-secondary"
        onClick={() => {
          toast.message(driveOn ? "OneDrive da escola" : "Drive pessoal", {
            description: driveOn
              ? "O SIGA guarda no armazenamento da escola. OneDrive fica catalog-ready nas Integrações."
              : "Instale Microsoft 365 Education em Definições → Integrações.",
          });
        }}
      >
        <HardDrive className="size-4" />
        {driveOn ? "OneDrive (escola)" : "Ligar Drive"}
      </button>
    </aside>
  );
}
