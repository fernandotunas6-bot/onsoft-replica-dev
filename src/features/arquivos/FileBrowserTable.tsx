import { Users } from "lucide-react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";
import { FileKindIcon, initialsFromName } from "./FileKindIcon";
import {
  canAccessFileContent,
  fileCategoryMeta,
  fileKindMeta,
  fileMyAccessMeta,
  fileNeedsOrganization,
  fileVisibilityMeta,
  formatFileActivityLine,
  formatFileSize,
  formatFileWhen,
  myFileAccess,
} from "./kinds";
import type { SchoolFileRecord } from "./schemas";

export function FileBrowserTable({
  files,
  selectedId,
  selectedIds,
  uploadProgress,
  account,
  pickMode,
  systemLockedMsg,
  onPick,
  onSelectId,
  onToggleSelect,
  onOpenRecord,
  onFolderDoubleClick,
}: {
  files: SchoolFileRecord[];
  selectedId: string | null;
  selectedIds: Set<string>;
  uploadProgress: Record<string, number>;
  account: { id: string; role: string };
  pickMode: boolean;
  systemLockedMsg: string;
  onPick?: (file: SchoolFileRecord) => void;
  onSelectId: (id: string) => void;
  onToggleSelect: (id: string, checked: boolean) => void;
  onOpenRecord: (file: SchoolFileRecord) => void;
  onFolderDoubleClick: (folderId: string) => void;
}) {
  return (
    <table className="w-full min-w-[720px] border-collapse text-left text-sm">
      <thead className="sticky top-0 z-10 bg-card text-[11px] uppercase tracking-wide text-muted-foreground">
        <tr className="border-b border-border">
          <th className="w-10 px-3 py-2.5 font-semibold">
            <span className="sr-only">Seleccionar</span>
          </th>
          <th className="px-4 py-2.5 font-semibold">Nome</th>
          <th className="px-3 py-2.5 font-semibold">ID</th>
          <th className="px-3 py-2.5 font-semibold">Modificado</th>
          <th className="px-3 py-2.5 font-semibold">Modificado por</th>
          <th className="px-3 py-2.5 font-semibold">Tamanho</th>
          <th className="px-3 py-2.5 font-semibold">Acesso</th>
          <th className="px-3 py-2.5 font-semibold">Actividade</th>
        </tr>
      </thead>
      <tbody>
        {files.map((file) => {
          const access = myFileAccess(file, account.id, account.role);
          const selectedRow = file.id === selectedId;
          return (
            <tr
              key={file.id}
              className={cn(
                "cursor-pointer border-b border-border/80 transition-colors hover:bg-secondary/50",
                selectedRow && "bg-primary-soft/60",
              )}
              onClick={() => onSelectId(file.id)}
              onDoubleClick={() => {
                if (file.isFolder) {
                  onFolderDoubleClick(file.id);
                  return;
                }
                if (pickMode && onPick) {
                  if (!canAccessFileContent(file, account.id, account.role)) {
                    toast.error(systemLockedMsg);
                    return;
                  }
                  onPick(file);
                } else if (!canAccessFileContent(file, account.id, account.role)) {
                  toast.error(systemLockedMsg);
                } else {
                  onOpenRecord(file);
                }
              }}
            >
              <td className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  checked={selectedIds.has(file.id)}
                  onChange={(event) => onToggleSelect(file.id, event.target.checked)}
                  onClick={(event) => event.stopPropagation()}
                  aria-label={`Seleccionar ${file.name}`}
                />
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <FileKindIcon kind={file.kind} visibility={file.visibility} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground">
                      {file.title || file.name}
                      {file.isSystem ? (
                        <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {canAccessFileContent(file, account.id, account.role)
                            ? "Sistema"
                            : "Protegido"}
                        </span>
                      ) : null}
                      {fileNeedsOrganization(file) ? (
                        <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-warning-foreground">
                          Por organizar
                        </span>
                      ) : null}
                    </span>
                    <span className="block text-[10px] text-muted-foreground">
                      {fileKindMeta[file.kind].label} · {fileMyAccessMeta[access].label}
                      {file.category ? ` · ${fileCategoryMeta[file.category].label}` : ""}
                      {file.classGroupId ? " · turma" : ""}
                      {file.relatedUserName ? ` · ${file.relatedUserName}` : ""}
                    </span>
                    {(uploadProgress[file.name] ?? 100) < 100 && (
                      <div className="mt-1 h-1.5 w-full max-w-[12rem] overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full bg-primary transition-all duration-300"
                          style={{ width: `${uploadProgress[file.name] ?? 0}%` }}
                        />
                      </div>
                    )}
                  </span>
                </div>
              </td>
              <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-muted-foreground">
                {file.referenceCode || "—"}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                {formatFileWhen(file.updatedAt ?? file.createdAt)}
              </td>
              <td className="px-3 py-3">
                <span className="flex max-w-[10rem] items-center gap-2 truncate text-muted-foreground">
                  <UserAvatar
                    url={file.updatedByAvatarUrl ?? file.ownerAvatarUrl}
                    initials={initialsFromName(file.updatedByName ?? file.ownerName)}
                    className="size-6 bg-secondary text-[9px] font-bold"
                  />
                  <span className="truncate">{file.updatedByName ?? file.ownerName ?? "—"}</span>
                </span>
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                {formatFileSize(file.sizeBytes)}
              </td>
              <td className="px-3 py-3">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold">
                  <Users className="size-3 opacity-70" />
                  {fileVisibilityMeta[file.visibility].short}
                </span>
              </td>
              <td className="max-w-[14rem] px-3 py-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-2 truncate">
                  <UserAvatar
                    url={file.lastActionByAvatarUrl ?? file.ownerAvatarUrl}
                    initials={initialsFromName(file.lastActionByName ?? file.ownerName)}
                    className="size-5 bg-secondary text-[8px] font-bold"
                  />
                  <span className="truncate">
                    {formatFileActivityLine({
                      action: file.lastAction,
                      actorName: file.lastActionByName ?? file.ownerName,
                      at: file.lastActionAt ?? file.updatedAt,
                      fallbackCreatedAt: file.createdAt,
                      fallbackOwnerName: file.ownerName,
                    })}
                  </span>
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
