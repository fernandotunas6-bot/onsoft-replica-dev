import { toast } from "sonner";
import { FileCoverTile } from "./FileCoverTile";
import {
  canAccessFileContent,
  fileKindMeta,
  fileNeedsOrganization,
  fileVisibilityMeta,
} from "./kinds";
import { isImageFileKind } from "./resolve-file";
import type { SchoolFileRecord } from "./schemas";

export function FileBrowserGrid({
  files,
  selectedId,
  selectedIds,
  previewUrlById,
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
  previewUrlById: Record<string, string>;
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
    <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 xl:grid-cols-4">
      {files.map((file) => (
        <div key={file.id} className="relative text-left">
          <label className="absolute left-2 top-2 z-10 rounded bg-card/90 p-0.5 shadow-sm">
            <input
              type="checkbox"
              checked={selectedIds.has(file.id)}
              onChange={(event) => onToggleSelect(file.id, event.target.checked)}
              onClick={(event) => event.stopPropagation()}
              aria-label={`Seleccionar ${file.name}`}
            />
          </label>
          <button
            type="button"
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
            className="w-full text-left"
          >
            <FileCoverTile
              file={file}
              selected={file.id === selectedId}
              locked={file.isSystem && !canAccessFileContent(file, account.id, account.role)}
              resolvedPreviewUrl={
                !file.isFolder &&
                file.storageBackend === "sga" &&
                isImageFileKind(file.kind) &&
                canAccessFileContent(file, account.id, account.role)
                  ? (previewUrlById[file.id] ?? null)
                  : undefined
              }
            />
            {(uploadProgress[file.name] ?? 100) < 100 && (
              <div className="absolute inset-x-2 bottom-10 h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${uploadProgress[file.name] ?? 0}%` }}
                />
              </div>
            )}
            <p className="mt-1 truncate px-1 text-xs font-medium">{file.title || file.name}</p>
            <p className="px-1 text-[11px] text-muted-foreground">
              {file.referenceCode ? (
                <span className="font-mono">{file.referenceCode}</span>
              ) : (
                fileKindMeta[file.kind].label
              )}
              {" · "}
              {fileVisibilityMeta[file.visibility].short}
              {fileNeedsOrganization(file) ? " · Por organizar" : ""}
            </p>
          </button>
        </div>
      ))}
    </div>
  );
}
