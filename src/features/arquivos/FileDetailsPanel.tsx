import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MediaFrame } from "@/components/ui/media-frame";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";
import { FileKindIcon, initialsFromName } from "./FileKindIcon";
import {
  fileActionLabels,
  fileCategoryMeta,
  fileKindMeta,
  fileMyAccessMeta,
  fileNeedsOrganization,
  fileVisibilityMeta,
  formatFileActivityLine,
  formatFileSize,
  formatFileWhen,
  type FileMyAccess,
} from "./kinds";
import { fileVisibilityOptions, type SchoolFileRecord } from "./schemas";

export type FileActivityEvent = {
  id: string;
  action: string;
  detail?: string | null;
  createdAt: string;
  actorName?: string | null;
  actorAvatarUrl?: string | null;
};

type FileDetailsPanelProps = {
  selected: SchoolFileRecord | null;
  previewUrl: string | null;
  myAccess: FileMyAccess | null;
  selectedContentOpen: boolean;
  selectedCanManage: boolean;
  systemLockedMsg: string;
  activityLoading: boolean;
  activityEvents: FileActivityEvent[];
  onChangeVisibility: (visibility: SchoolFileRecord["visibility"]) => void;
  onOrganize: (file: SchoolFileRecord) => void;
  onEditMeta: () => void;
};

export function FileDetailsPanel({
  selected,
  previewUrl,
  myAccess,
  selectedContentOpen,
  selectedCanManage,
  systemLockedMsg,
  activityLoading,
  activityEvents,
  onChangeVisibility,
  onOrganize,
  onEditMeta,
}: FileDetailsPanelProps) {
  if (!selected) {
    return (
      <aside className="flex min-h-0 flex-col bg-card p-4">
        <p className="text-sm text-muted-foreground">
          Seleccione um ficheiro para ver o proprietário, o nível de acesso e a auditoria. Enter abre ·
          Esc limpa a selecção · arraste ficheiros para carregar.
        </p>
      </aside>
    );
  }

  return (
    <aside className="flex min-h-0 flex-col bg-card p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        Detalhes
      </p>
      {previewUrl ? (
        <MediaFrame
          src={previewUrl}
          alt={`Pré-visualização de ${selected.name}`}
          ratio="16/5"
          rounded="rounded-xl"
          className="mt-3 max-h-36 border border-border bg-secondary/40"
        />
      ) : (
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-border bg-secondary/30 px-3 py-3">
          <FileKindIcon kind={selected.kind} visibility={selected.visibility} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{selected.name}</p>
            <p className="text-[11px] text-muted-foreground">
              {fileKindMeta[selected.kind].label} · {formatFileSize(selected.sizeBytes)}
            </p>
          </div>
        </div>
      )}
      <h3 className="mt-3 break-words text-base font-semibold">{selected.name}</h3>
      <dl className="mt-4 space-y-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Proprietário</dt>
          <dd className="mt-1 flex items-center gap-2 font-medium">
            <UserAvatar
              url={selected.ownerAvatarUrl}
              initials={initialsFromName(selected.ownerName)}
              className="size-7 bg-secondary text-[10px] font-bold"
            />
            {selected.ownerName ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">O seu nível</dt>
          <dd className={cn("font-medium", myAccess ? fileMyAccessMeta[myAccess].tone : "")}>
            {myAccess ? fileMyAccessMeta[myAccess].label : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Nível de acesso</dt>
          <dd className="mt-1">
            {myAccess === "view" ? (
              <span className="font-medium">{fileVisibilityMeta[selected.visibility].label}</span>
            ) : (
              <select
                value={selected.visibility}
                onChange={(event) =>
                  onChangeVisibility(event.target.value as SchoolFileRecord["visibility"])
                }
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                aria-label="Nível de acesso"
              >
                {fileVisibilityOptions.map((value) => (
                  <option key={value} value={value}>
                    {fileVisibilityMeta[value].label}
                  </option>
                ))}
              </select>
            )}
            <p className="mt-1 text-[11px] text-muted-foreground">
              {fileVisibilityMeta[selected.visibility].description}
            </p>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Metadados</dt>
          <dd className="mt-1 space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">Categoria: </span>
              {selected.category ? fileCategoryMeta[selected.category].label : "—"}
            </p>
            <p>
              <span className="text-muted-foreground">ID do documento: </span>
              <span className="font-mono text-xs">{selected.referenceCode || "—"}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Data doc.: </span>
              {selected.documentDate || "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Utilizador: </span>
              {selected.relatedUserName || "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Pessoa: </span>
              {selected.relatedPersonName || "—"}
            </p>
            {selected.isSystem ? (
              <p>
                <span className="text-muted-foreground">Origem: </span>
                Sistema
                {!selectedContentOpen ? " · conteúdo oculto sem permissão" : ""}
              </p>
            ) : null}
            {selectedContentOpen && selected.description ? (
              <p className="text-muted-foreground">{selected.description}</p>
            ) : selectedContentOpen ? (
              <p className="text-destructive">Sem descrição — organize este ficheiro.</p>
            ) : (
              <p className="text-muted-foreground">{systemLockedMsg}</p>
            )}
            {fileNeedsOrganization(selected) && myAccess !== "view" && selectedCanManage ? (
              <Button
                type="button"
                size="sm"
                className="mt-1"
                onClick={() => onOrganize(selected)}
              >
                Completar inquérito
              </Button>
            ) : null}
            {myAccess !== "view" && selectedCanManage ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-1"
                onClick={onEditMeta}
              >
                Organizar / editar
              </Button>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Tamanho</dt>
          <dd className="font-medium">{formatFileSize(selected.sizeBytes)}</dd>
        </div>
      </dl>
      <div className="mt-6 min-h-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Auditoria
        </p>
        {activityLoading ? (
          <p className="mt-2 text-xs text-muted-foreground">A carregar…</p>
        ) : activityEvents.length > 0 ? (
          <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto text-xs">
            {activityEvents.map((event) => (
              <li key={event.id} className="rounded-lg border border-border px-2.5 py-2">
                <div className="flex items-start gap-2">
                  <UserAvatar
                    url={event.actorAvatarUrl}
                    initials={initialsFromName(event.actorName)}
                    className="mt-0.5 size-6 bg-secondary text-[9px] font-bold"
                  />
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {event.actorName ?? "Utilizador"}{" "}
                      {fileActionLabels[event.action] ?? event.action}
                    </p>
                    <p className="text-muted-foreground">{formatFileWhen(event.createdAt)}</p>
                    {event.detail ? (
                      <p className="mt-0.5 truncate text-muted-foreground">{event.detail}</p>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            {formatFileActivityLine({
              action: selected.lastAction,
              actorName: selected.lastActionByName ?? selected.ownerName,
              at: selected.lastActionAt ?? selected.updatedAt,
              fallbackCreatedAt: selected.createdAt,
              fallbackOwnerName: selected.ownerName,
            })}
            . Aplique o SQL para o histórico completo.
          </p>
        )}
      </div>
    </aside>
  );
}

/** Helper de tipagem — evita import circular toast no painel. */
export function notifyFileDetailsError(message: string) {
  toast.error(message);
}
