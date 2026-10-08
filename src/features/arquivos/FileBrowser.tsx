import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  ChevronRight,
  Copy,
  Download,
  FolderPlus,
  FolderOpen,
  HardDrive,
  LayoutGrid,
  List,
  Lock,
  PanelRight,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { useInstalledIntegrations } from "@/features/integrations/use-installed-integrations";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { SqlChecklistLink } from "@/components/ui/sql-checklist-link";
import { FileCoverTile } from "./FileCoverTile";
import { documentCodeSearchHint } from "./document-code";
import { FileKindIcon, initialsFromName } from "./FileKindIcon";
import { applyLibraryPhotoToPerson } from "./apply-person-photo";
import { MoveItemsDialog } from "./MoveItemsDialog";
import { FileDetailsPanel } from "./FileDetailsPanel";
import { FileBrowserNav } from "./FileBrowserNav";
import { FileBrowserGrid } from "./FileBrowserGrid";
import { FileBrowserTable } from "./FileBrowserTable";
import { FileUploadInquiryModal, type UploadInquiryResult } from "./FileUploadInquiry";
import {
  canAccessFileContent,
  canManageSystemFile,
  canWriteFileArea,
  defaultVisibilityForArea,
  fileAcceptAttr,
  fileActionLabels,
  fileAreaMeta,
  fileCategoryMeta,
  fileKindMeta,
  fileMyAccessMeta,
  fileNeedsOrganization,
  fileVisibilityMeta,
  formatFileActivityLine,
  formatFileSize,
  formatFileWhen,
  isAllowedSchoolFile,
  isFileRelatedToUser,
  kindFromFile,
  myFileAccess,
  visibleAreasForRole,
  writableAreasForRole,
  type FileArea,
  type FileKind,
} from "./kinds";
import {
  deleteLocalFile,
  listLocalFiles,
  localStoragePath,
  patchLocalFileMeta,
  saveLocalFile,
  saveLocalFolder,
} from "./local-store";
import { readFilesPrefs, writeFilesPrefs } from "./prefs";
import { isImageFileKind, resolveFileBlob, resolveFileUrl } from "./resolve-file";
import { schoolFileShareText } from "./share-text";
import {
  fileCategoryOptions,
  fileKindOptions,
  fileVisibilityOptions,
  type SchoolFileRecord,
} from "./schemas";
import {
  createSchoolFolder,
  deleteSchoolFile,
  listArquivosClassOptions,
  listArquivosUserOptions,
  listFolderTrail,
  listSchoolFileActivity,
  listSchoolFiles,
  logSchoolFileEvent,
  moveSchoolFiles,
  registerSchoolFile,
  renameSchoolFile,
  setSchoolFileVisibility,
  signSchoolFiles,
  updateSchoolFileMeta,
} from "./server";

const FILES_BUCKET = "siga-files";

const repoIcon = {
  escola: FolderOpen,
  secretaria: Lock,
  pessoal: HardDrive,
  publico: Users,
} as const;

function blankAudit(
  ownerName: string | null = null,
): Pick<
  SchoolFileRecord,
  | "title"
  | "description"
  | "category"
  | "documentDate"
  | "referenceCode"
  | "relatedUserId"
  | "relatedPersonId"
  | "parentId"
  | "isFolder"
  | "isSystem"
  | "relatedUserName"
  | "relatedPersonName"
  | "updatedAt"
  | "updatedByUserId"
  | "lastAction"
  | "lastActionAt"
  | "lastActionByUserId"
  | "ownerName"
  | "updatedByName"
  | "lastActionByName"
  | "ownerAvatarUrl"
  | "updatedByAvatarUrl"
  | "lastActionByAvatarUrl"
> {
  return {
    title: null,
    description: null,
    category: "outro",
    documentDate: null,
    referenceCode: null,
    relatedUserId: null,
    relatedPersonId: null,
    parentId: null,
    isFolder: false,
    isSystem: false,
    relatedUserName: null,
    relatedPersonName: null,
    updatedAt: null,
    updatedByUserId: null,
    lastAction: "created",
    lastActionAt: new Date().toISOString(),
    lastActionByUserId: null,
    ownerName,
    updatedByName: null,
    lastActionByName: ownerName,
    ownerAvatarUrl: null,
    updatedByAvatarUrl: null,
    lastActionByAvatarUrl: null,
  };
}

async function openRecord(file: SchoolFileRecord) {
  if (file.isFolder) return;
  const url = await resolveFileUrl(file);
  window.open(url, "_blank", "noopener,noreferrer");
  void logSchoolFileEvent({ data: { id: file.id, action: "opened" } }).catch(() => undefined);
}

async function downloadRecord(file: SchoolFileRecord) {
  if (file.isFolder) throw new Error("Pastas não se descarregam.");
  const blob = await resolveFileBlob(file);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  anchor.click();
  URL.revokeObjectURL(url);
  void logSchoolFileEvent({ data: { id: file.id, action: "downloaded" } }).catch(() => undefined);
}

const SYSTEM_LOCKED_MSG =
  "Ficheiro do sistema — visível na lista, mas o conteúdo está oculto sem permissão.";

export function FileBrowser({
  pickMode = false,
  initialArea,
  acceptKinds,
  classGroupId,
  initialClassGroupId,
  initialRelatedPersonId,
  onPick,
}: {
  pickMode?: boolean;
  initialArea?: FileArea | undefined;
  acceptKinds?: readonly FileKind[] | undefined;
  classGroupId?: string;
  initialClassGroupId?: string;
  initialRelatedPersonId?: string;
  onPick?: (file: SchoolFileRecord) => void;
}) {
  const account = useCurrentAccount();
  const queryClient = useQueryClient();
  const installed = useInstalledIntegrations();
  const prefs = readFilesPrefs(account.role);
  const areas = visibleAreasForRole(account.role);
  const writableAreas = writableAreasForRole(account.role);
  const lockedClassId = classGroupId ?? null;
  const [area, setArea] = useState<FileArea>(
    initialArea && areas.includes(initialArea) ? initialArea : prefs.defaultArea,
  );
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<FileKind | "all">("all");
  const [classFilter, setClassFilter] = useState<string>(
    lockedClassId ?? initialClassGroupId ?? "all",
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "grid">(prefs.viewMode);
  const [sortBy, setSortBy] = useState<"name" | "date" | "size">(prefs.sortBy);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [moveOpen, setMoveOpen] = useState(false);
  const [organizeTarget, setOrganizeTarget] = useState<SchoolFileRecord | null>(null);
  const [needsOrganizeOnly, setNeedsOrganizeOnly] = useState(false);
  const [ownershipFilter, setOwnershipFilter] = useState<"all" | "mine" | "system">("all");
  const [categoryFilter, setCategoryFilter] = useState<
    (typeof fileCategoryOptions)[number] | "all"
  >("all");
  const [relatedUserFilter, setRelatedUserFilter] = useState<string>("all");
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const driveOn = installed.hasCapability("m365.onedrive");
  const canWrite = canWriteFileArea(account.role, area);
  const canUpload =
    writableAreas.length > 0 &&
    (!initialRelatedPersonId || writableAreas.includes("secretaria"));
  const kindChoices = (
    acceptKinds?.length
      ? fileKindOptions.filter((kind) => acceptKinds.includes(kind))
      : [...fileKindOptions]
  ).filter((kind) => kind !== "folder");
  const uploadAccept = acceptKinds?.length
    ? acceptKinds.map((kind) => fileKindMeta[kind].accept).join(",")
    : fileAcceptAttr;
  const activeClassId = lockedClassId ?? (classFilter !== "all" ? classFilter : undefined);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (lockedClassId) setClassFilter(lockedClassId);
    else if (initialClassGroupId) setClassFilter(initialClassGroupId);
  }, [initialClassGroupId, lockedClassId]);

  useEffect(() => {
    writeFilesPrefs({
      ...readFilesPrefs(account.role),
      viewMode,
      sortBy,
    });
  }, [account.role, sortBy, viewMode]);

  const classesQuery = useQuery({
    queryKey: ["arquivos", "class-options"],
    queryFn: () => listArquivosClassOptions(),
    staleTime: 60_000,
  });

  const usersQuery = useQuery({
    queryKey: ["arquivos", "user-options"],
    queryFn: () => listArquivosUserOptions(),
    staleTime: 60_000,
  });

  const remoteQuery = useQuery({
    queryKey: [
      "arquivos",
      "list",
      area,
      debouncedQuery,
      activeClassId ?? "all",
      categoryFilter,
      relatedUserFilter,
      initialRelatedPersonId ?? "all",
      folderId ?? "root",
    ],
    queryFn: () =>
      listSchoolFiles({
        data: {
          area,
          query: debouncedQuery || undefined,
          classGroupId: activeClassId,
          category: categoryFilter === "all" ? undefined : categoryFilter,
          relatedUserId: relatedUserFilter === "all" ? undefined : relatedUserFilter,
          relatedPersonId: initialRelatedPersonId,
          parentId: folderId,
          limit: 48,
        },
      }),
    staleTime: 30_000,
  });

  const trailQuery = useQuery({
    queryKey: ["arquivos", "trail", folderId ?? "root"],
    queryFn: () => listFolderTrail({ data: { folderId } }),
    staleTime: 30_000,
  });

  const foldersQuery = useQuery({
    queryKey: ["arquivos", "folders", area],
    enabled: moveOpen,
    queryFn: () => listSchoolFiles({ data: { area, limit: 48 } }),
    staleTime: 15_000,
  });

  const localQuery = useQuery({
    queryKey: [
      "arquivos",
      "local",
      remoteQuery.data?.schoolId,
      account.id,
      area,
      debouncedQuery,
      activeClassId ?? "all",
      folderId ?? "root",
    ],
    enabled: Boolean(remoteQuery.data?.schoolId && account.id),
    queryFn: () =>
      listLocalFiles({
        schoolId: remoteQuery.data!.schoolId,
        ownerUserId: account.id,
        area,
        classGroupId: activeClassId,
        parentId: folderId,
        query: debouncedQuery || undefined,
        limit: 48,
      }),
    staleTime: 15_000,
  });

  const files = useMemo(() => {
    const remote = remoteQuery.data?.files ?? [];
    const local = localQuery.data ?? [];
    const seen = new Set(remote.map((item) => item.id));
    const merged = [...remote, ...local.filter((item) => !seen.has(item.id))];
    const filtered = merged
      .filter((item) => !acceptKinds?.length || acceptKinds.includes(item.kind))
      .filter((item) => kindFilter === "all" || item.kind === kindFilter)
      .filter((item) => categoryFilter === "all" || item.category === categoryFilter)
      .filter((item) => relatedUserFilter === "all" || item.relatedUserId === relatedUserFilter)
      .filter((item) => !initialRelatedPersonId || item.relatedPersonId === initialRelatedPersonId)
      .filter((item) => !needsOrganizeOnly || fileNeedsOrganization(item))
      .filter((item) => {
        if (ownershipFilter === "mine") return isFileRelatedToUser(item, account.id);
        if (ownershipFilter === "system") return Boolean(item.isSystem);
        return true;
      });
    filtered.sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
      if (sortBy === "name") return a.name.localeCompare(b.name, "pt");
      if (sortBy === "size") return b.sizeBytes - a.sizeBytes;
      return (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt);
    });
    return filtered.slice(0, 48);
  }, [
    acceptKinds,
    account.id,
    categoryFilter,
    initialRelatedPersonId,
    kindFilter,
    localQuery.data,
    needsOrganizeOnly,
    ownershipFilter,
    relatedUserFilter,
    remoteQuery.data?.files,
    sortBy,
  ]);

  // Assina todas as miniaturas visíveis numa só chamada, em vez de cada FileCoverTile
  // pedir a sua própria URL assinada (até 48 pedidos em paralelo por pasta cheia de fotos).
  const imagePreviewIds = useMemo(
    () =>
      files
        .filter(
          (file) =>
            !file.isFolder &&
            file.storageBackend === "sga" &&
            isImageFileKind(file.kind) &&
            canAccessFileContent(file, account.id, account.role),
        )
        .map((file) => file.id),
    [account.id, account.role, files],
  );
  const previewsQuery = useQuery({
    queryKey: ["arquivos", "previews", imagePreviewIds.join(",")],
    enabled: imagePreviewIds.length > 0,
    queryFn: () => signSchoolFiles({ data: { ids: imagePreviewIds } }),
    staleTime: 5 * 60_000,
  });
  const previewUrlById = previewsQuery.data?.urls ?? {};

  const disorganizedCount = useMemo(() => {
    const remote = remoteQuery.data?.files ?? [];
    const local = localQuery.data ?? [];
    const seen = new Set(remote.map((item) => item.id));
    return [...remote, ...local.filter((item) => !seen.has(item.id))].filter((item) =>
      fileNeedsOrganization(item),
    ).length;
  }, [localQuery.data, remoteQuery.data?.files]);

  const selected = files.find((item) => item.id === selectedId) ?? null;
  const localOnly = remoteQuery.data?.backend === "local";
  const classOptions = classesQuery.data?.classes ?? [];
  const myAccess = selected ? myFileAccess(selected, account.id, account.role) : null;
  const selectedContentOpen =
    selected != null && canAccessFileContent(selected, account.id, account.role);
  const selectedCanManage =
    selected != null && canManageSystemFile(selected, account.id, account.role);

  useEffect(() => {
    if (
      !selected ||
      !isImageFileKind(selected.kind) ||
      !detailsOpen ||
      !canAccessFileContent(selected, account.id, account.role)
    ) {
      setPreviewUrl(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    void resolveFileUrl(selected)
      .then((url) => {
        if (cancelled) {
          if (url.startsWith("blob:")) URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url.startsWith("blob:") ? url : null;
        setPreviewUrl(url);
      })
      .catch(() => {
        if (!cancelled) setPreviewUrl(null);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [account.id, account.role, detailsOpen, selected]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(null);
      if (!selected) return;
      if (event.key === "Enter" && !event.metaKey && !event.ctrlKey) {
        const tag = (event.target as HTMLElement | null)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        event.preventDefault();
        if (pickMode && onPick) {
          if (!canAccessFileContent(selected, account.id, account.role)) {
            toast.error(SYSTEM_LOCKED_MSG);
            return;
          }
          onPick(selected);
        } else if (!canAccessFileContent(selected, account.id, account.role)) {
          toast.error(SYSTEM_LOCKED_MSG);
        } else void openRecord(selected).catch((error) => toast.error(error.message));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [account.id, account.role, onPick, pickMode, selected]);

  const activityQuery = useQuery({
    queryKey: ["arquivos", "activity", selected?.id],
    enabled: Boolean(selected && detailsOpen),
    queryFn: () => listSchoolFileActivity({ data: { id: selected!.id, limit: 20 } }),
    staleTime: 15_000,
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["arquivos", "list"] }),
      queryClient.invalidateQueries({ queryKey: ["arquivos", "local"] }),
      queryClient.invalidateQueries({ queryKey: ["arquivos", "turma"] }),
      queryClient.invalidateQueries({ queryKey: ["arquivos", "local-turma"] }),
      queryClient.invalidateQueries({ queryKey: ["arquivos", "activity"] }),
    ]);
  };

  const toggleSelect = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const createFolder = async () => {
    const schoolId = remoteQuery.data?.schoolId;
    if (!schoolId || !canWriteFileArea(account.role, area)) return;
    const name = window.prompt("Nome da pasta")?.trim();
    if (!name) return;
    const id = crypto.randomUUID();
    const record: SchoolFileRecord = {
      id,
      schoolId,
      ownerUserId: account.id,
      name,
      mime: "application/vnd.siga.folder",
      kind: "folder",
      sizeBytes: 1,
      area,
      visibility: defaultVisibilityForArea(area),
      storageBackend: "local",
      storagePath: `folder/${id}`,
      classGroupId: null,
      createdAt: new Date().toISOString(),
      ...blankAudit(account.name),
      parentId: folderId,
      isFolder: true,
      title: name,
      description: "Pasta da biblioteca SIGA",
      category: "outro",
      ownerAvatarUrl: account.avatarUrl,
      lastActionByAvatarUrl: account.avatarUrl,
      lastAction: "folder_created",
      lastActionAt: new Date().toISOString(),
      lastActionByUserId: account.id,
    };
    try {
      const created = await createSchoolFolder({
        data: {
          id,
          name,
          area,
          parentId: folderId,
          visibility: record.visibility,
        },
      });
      if (created.storage === "local" || !created.record) {
        await saveLocalFolder(created.record ?? record);
      }
      toast.success("Pasta criada");
      await refresh();
    } catch (error) {
      toast.error("Não foi possível criar a pasta", {
        description: error instanceof Error ? error.message : "Tente novamente.",
      });
    }
  };

  const commitMove = async (parentId: string | null) => {
    const ids = [...selectedIds];
    setMoveOpen(false);
    if (!ids.length) return;
    try {
      for (const id of ids) {
        await patchLocalFileMeta(id, { parentId });
      }
      const result = await moveSchoolFiles({
        data: { ids, parentId, area },
      });
      toast[result.localOnly ? "message" : "success"](
        result.localOnly ? "Movido neste dispositivo" : `${ids.length} item(ns) movido(s)`,
      );
      setSelectedIds(new Set());
      await refresh();
    } catch (error) {
      toast.error("Não foi possível mover", {
        description: error instanceof Error ? error.message : "Tente novamente.",
      });
    }
  };

  const uploadFiles = async (list: FileList | File[] | null) => {
    if (!list?.length || !canUpload || uploading || pendingFiles.length > 0) return;
    if (initialRelatedPersonId && !canWriteFileArea(account.role, "secretaria")) {
      toast.error("Sem permissão para carregar documentos pessoais na Secretaria.");
      return;
    }
    const accepted: File[] = [];
    for (const file of Array.from(list)) {
      const allowed = isAllowedSchoolFile(file);
      if (!allowed.ok) {
        toast.error(file.name, { description: allowed.error });
        continue;
      }
      const kind = kindFromFile(file.name, file.type);
      if (!kind) continue;
      if (acceptKinds?.length && !acceptKinds.includes(kind)) {
        toast.error(file.name, { description: "Este tipo não é aceite aqui." });
        continue;
      }
      accepted.push(file);
    }
    if (!accepted.length) return;
    setPendingFiles(accepted);
    if (inputRef.current) inputRef.current.value = "";
  };

  const commitUpload = async (meta: UploadInquiryResult) => {
    const schoolId = remoteQuery.data?.schoolId;
    const files = pendingFiles;
    const targetArea = meta.area;
    if (!files.length) return;
    if (!schoolId) {
      toast.error("Escola indisponível. Inicie sessão novamente.");
      return;
    }
    if (!canWriteFileArea(account.role, targetArea)) {
      toast.error("Sem permissão para carregar nesta área.");
      return;
    }
    if (initialRelatedPersonId && meta.relatedPersonId !== initialRelatedPersonId) {
      toast.error("O documento deve ficar associado à pessoa deste perfil.");
      return;
    }
    if (initialRelatedPersonId && meta.visibility !== "private") {
      toast.error("Os documentos pessoais devem ter visibilidade privada.");
      return;
    }
    if (initialRelatedPersonId && targetArea !== "secretaria") {
      toast.error("Os documentos pessoais devem ser guardados na área reservada da Secretaria.");
      return;
    }
    setPendingFiles([]);
    setUploading(true);
    setUploadProgress(files.reduce((acc, f) => ({ ...acc, [f.name]: 0 }), {}));
    let appliedProfilePhoto = false;
    // Um envio recusado pelo Storage cai para o IndexedDB deste browser. Isso é
    // deliberado (serve para trabalhar sem rede), mas até 2026-09-28 o ecrã dizia
    // «organizados» à mesma: o ficheiro existia na lista, não existia na escola, e
    // desaparecia ao limpar os dados do site ou ao abrir noutro computador. Quem
    // ficar por aqui tem de ser dito em voz alta.
    const ficaramNesteBrowser: string[] = [];
    try {
      if (targetArea !== area) setArea(targetArea);
      for (const file of files) {
        const kind = kindFromFile(file.name, file.type);
        if (!kind) continue;
        // O SDK do Storage não expõe progresso real: aproximamos com uma rampa
        // que abranda perto dos 90% e só fecha em 100% quando o envio termina.
        const ramp = setInterval(() => {
          setUploadProgress((prev) => {
            const current = prev[file.name] ?? 0;
            if (current >= 90) return prev;
            return {
              ...prev,
              [file.name]: Math.min(90, current + Math.max(1, (90 - current) / 8)),
            };
          });
        }, 180);
        const id = crypto.randomUUID();
        const storagePath = localStoragePath({
          schoolId,
          area: targetArea,
          ownerUserId: account.id,
          id,
          name: file.name,
        });
        let backend: "sga" | "local" = "local";
        try {
          const { error } = await supabase.storage
            .from(FILES_BUCKET)
            .upload(storagePath, file, { upsert: false, cacheControl: "3600" });
          if (error) ficaramNesteBrowser.push(file.name);
          else backend = "sga";
        } catch {
          ficaramNesteBrowser.push(file.name);
        } finally {
          clearInterval(ramp);
        }
        const record: SchoolFileRecord = {
          id,
          schoolId,
          ownerUserId: account.id,
          name: file.name,
          mime: file.type || "application/octet-stream",
          kind,
          sizeBytes: file.size,
          area: targetArea,
          visibility: meta.visibility,
          storageBackend: backend,
          storagePath,
          classGroupId: activeClassId ?? null,
          createdAt: new Date().toISOString(),
          ...blankAudit(account.name),
          parentId: folderId,
          isFolder: false,
          title: meta.title ?? file.name,
          description: meta.description || null,
          category: meta.category ?? "outro",
          documentDate: meta.documentDate || null,
          referenceCode: meta.referenceCode || null,
          relatedUserId: meta.relatedUserId || account.id,
          relatedPersonId: meta.relatedPersonId ?? null,
          ownerAvatarUrl: account.avatarUrl,
          lastActionByAvatarUrl: account.avatarUrl,
        };
        if (backend === "local") {
          await saveLocalFile({ record, blob: file });
        }
        const registered = await registerSchoolFile({
          data: {
            id,
            name: record.name,
            mime: record.mime,
            sizeBytes: record.sizeBytes,
            area: record.area,
            visibility: record.visibility,
            storagePath: record.storagePath,
            storageBackend: backend,
            classGroupId: activeClassId,
            parentId: folderId,
            title: record.title ?? undefined,
            description: record.description ?? undefined,
            category: record.category ?? undefined,
            documentDate: record.documentDate ?? undefined,
            referenceCode: record.referenceCode ?? undefined,
            relatedUserId: record.relatedUserId,
            relatedPersonId: record.relatedPersonId,
          },
        });
        const storedRecord: SchoolFileRecord =
          registered.storage === "local" && backend === "sga"
            ? { ...record, storageBackend: "local" }
            : record;
        if (registered.storage === "local" && backend === "sga") {
          await saveLocalFile({ record: storedRecord, blob: file });
          ficaramNesteBrowser.push(file.name);
        }
        if (
          meta.category === "foto" &&
          meta.relatedPersonId &&
          meta.applyAsProfilePhoto !== false &&
          !appliedProfilePhoto &&
          (storedRecord.kind === "png" || storedRecord.kind === "jpeg")
        ) {
          await applyLibraryPhotoToPerson({
            personId: meta.relatedPersonId,
            schoolId,
            file: storedRecord,
          });
          appliedProfilePhoto = true;
          void queryClient.invalidateQueries({ queryKey: ["students"] });
          void queryClient.invalidateQueries({ queryKey: ["people"] });
        }
        setUploadProgress((prev) => ({ ...prev, [file.name]: 100 }));
      }
      if (ficaramNesteBrowser.length) {
        const nomes = [...new Set(ficaramNesteBrowser)];
        toast.warning(
          nomes.length === 1
            ? `${nomes[0]} ficou só neste computador`
            : `${nomes.length} ficheiros ficaram só neste computador`,
          {
            description:
              "Não foi possível enviá-los para a escola. Ficam guardados neste browser e " +
              "desaparecem se limpar os dados do site. Verifique a ligação e envie outra vez.",
            duration: 10000,
          },
        );
      } else {
        toast.success(
          appliedProfilePhoto
            ? "Fotografia guardada e aplicada no perfil do aluno"
            : `Ficheiros organizados em ${fileAreaMeta[targetArea].label}`,
        );
      }
      await refresh();
    } catch (error) {
      toast.error("Não foi possível guardar", {
        description: error instanceof Error ? error.message : "Tente novamente.",
      });
    } finally {
      setUploading(false);
    }
  };

  const commitOrganize = async (meta: UploadInquiryResult) => {
    if (!organizeTarget || myFileAccess(organizeTarget, account.id, account.role) === "view") {
      setOrganizeTarget(null);
      return;
    }
    if (!canManageSystemFile(organizeTarget, account.id, account.role)) {
      toast.error("Ficheiro do sistema protegido — sem permissão para alterar.");
      setOrganizeTarget(null);
      return;
    }
    const target = organizeTarget;
    setOrganizeTarget(null);
    try {
      await patchLocalFileMeta(target.id, {
        area: meta.area,
        visibility: meta.visibility,
        title: meta.title ?? target.name,
        description: meta.description || null,
        category: meta.category ?? "outro",
        documentDate: meta.documentDate || null,
        referenceCode: meta.referenceCode || null,
        relatedUserId: meta.relatedUserId ?? null,
        relatedPersonId: meta.relatedPersonId ?? null,
      });
      const result = await updateSchoolFileMeta({
        data: {
          id: target.id,
          title: meta.title ?? target.name,
          description: meta.description || null,
          category: meta.category ?? "outro",
          documentDate: meta.documentDate || null,
          referenceCode: meta.referenceCode || null,
          relatedUserId: meta.relatedUserId || account.id,
          relatedPersonId: meta.relatedPersonId ?? null,
          visibility: meta.visibility,
          area: meta.area,
        },
      });
      if (meta.area !== area) setArea(meta.area);
      if (
        meta.category === "foto" &&
        meta.relatedPersonId &&
        meta.applyAsProfilePhoto !== false &&
        (target.kind === "png" || target.kind === "jpeg")
      ) {
        await applyLibraryPhotoToPerson({
          personId: meta.relatedPersonId,
          schoolId: target.schoolId,
          file: {
            ...target,
            title: meta.title ?? target.name,
            description: meta.description || null,
            category: "foto",
            relatedPersonId: meta.relatedPersonId,
          },
        });
        void queryClient.invalidateQueries({ queryKey: ["students"] });
      }
      toast[result.localOnly ? "message" : "success"](
        result.localOnly
          ? "Organização guardada neste dispositivo"
          : `Ficheiro organizado · ${fileAreaMeta[meta.area].label}`,
      );
      await refresh();
    } catch (error) {
      toast.error("Não foi possível organizar", {
        description: error instanceof Error ? error.message : "Tente novamente.",
      });
    }
  };

  const removeSelected = async () => {
    if (!selected) return;
    if (
      !window.confirm(
        `Apagar "${selected.name}" definitivamente? Esta acção não pode ser desfeita.`,
      )
    ) {
      return;
    }
    try {
      await deleteLocalFile(selected.id);
      await deleteSchoolFile({ data: { id: selected.id } });
      setSelectedId(null);
      toast.success("Ficheiro removido");
      await refresh();
    } catch (error) {
      toast.error("Não foi possível apagar", {
        description: error instanceof Error ? error.message : "Tente novamente.",
      });
    }
  };

  const renameSelected = async () => {
    if (!selected || !canWrite) return;
    const next = window.prompt("Novo nome do ficheiro", selected.name)?.trim();
    if (!next || next === selected.name) return;
    try {
      await patchLocalFileMeta(selected.id, { name: next });
      const result = await renameSchoolFile({ data: { id: selected.id, name: next } });
      toast[result.localOnly ? "message" : "success"](
        result.localOnly ? "Renomeado neste dispositivo" : "Ficheiro renomeado",
      );
      await refresh();
    } catch (error) {
      toast.error("Não foi possível renomear", {
        description: error instanceof Error ? error.message : "Tente novamente.",
      });
    }
  };

  const changeVisibility = async (visibility: SchoolFileRecord["visibility"]) => {
    if (!selected || myAccess === "view") return;
    try {
      await patchLocalFileMeta(selected.id, { visibility });
      const result = await setSchoolFileVisibility({
        data: { id: selected.id, visibility },
      });
      if (result.localOnly) {
        toast.message("Nível guardado neste dispositivo", {
          description: "Aplique o SQL premium para sincronizar a auditoria na escola.",
        });
      } else {
        toast.success("Nível de acesso actualizado");
      }
      await refresh();
    } catch (error) {
      toast.error("Não foi possível alterar o acesso", {
        description: error instanceof Error ? error.message : "Tente novamente.",
      });
    }
  };

  const saveSelectedMeta = () => {
    if (!selected || myAccess === "view") return;
    setOrganizeTarget(selected);
  };

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-card"
      onDragEnter={(event) => {
        if (!canUpload) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragOver={(event) => {
        if (!canUpload) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setDragging(false);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (!canUpload) return;
        void uploadFiles(event.dataTransfer.files);
      }}
    >
      {dragging && canUpload ? (
        <div className="pointer-events-none absolute inset-0 z-50 flex animate-in fade-in items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex h-[calc(100%-2rem)] w-[calc(100%-2rem)] animate-pulse flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-primary bg-primary/5 text-primary">
            <Upload className="size-10" aria-hidden />
            <p className="text-lg font-semibold">Soltar para carregar</p>
            <p className="text-xs font-medium opacity-80">
              Os ficheiros são enviados para {fileAreaMeta[area].label}
            </p>
          </div>
        </div>
      ) : null}
      <header className="space-y-0 border-b border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <nav className="flex min-w-0 items-center gap-1.5 text-sm" aria-label="Localização">
            <UserAvatar
              url={account.avatarUrl}
              initials={account.initials}
              className="size-8 bg-primary-soft text-[11px] font-bold text-primary"
            />
            <span className="truncate font-semibold text-foreground">{account.name}</span>
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
            <button
              type="button"
              className="truncate text-muted-foreground hover:text-foreground"
              onClick={() => {
                setFolderId(null);
                setSelectedIds(new Set());
              }}
            >
              {fileAreaMeta[area].label}
            </button>
            {(trailQuery.data?.trail ?? []).map((crumb) => (
              <span key={crumb.id} className="flex min-w-0 items-center gap-1.5">
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                <button
                  type="button"
                  className="truncate text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setFolderId(crumb.id);
                    setSelectedIds(new Set());
                  }}
                >
                  {crumb.name}
                </button>
              </span>
            ))}
            {activeClassId ? (
              <>
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate text-muted-foreground">
                  {classOptions.find((item) => item.id === activeClassId)?.name ?? "Turma"}
                </span>
              </>
            ) : null}
          </nav>
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="mr-1 hidden text-xs text-muted-foreground sm:block">
              {account.role} · a trabalhar
            </p>
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              aria-label="Organizar"
            >
              <option value="date">Organizar · data</option>
              <option value="name">Organizar · nome</option>
              <option value="size">Organizar · tamanho</option>
            </select>
            <Button
              type="button"
              size="sm"
              variant={viewMode === "list" ? "secondary" : "ghost"}
              className="px-2"
              onClick={() => setViewMode("list")}
              aria-label="Vista em lista"
            >
              <List className="size-4" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              className="px-2"
              onClick={() => setViewMode("grid")}
              aria-label="Vista em grelha"
            >
              <LayoutGrid className="size-4" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant={detailsOpen ? "secondary" : "ghost"}
              className="gap-1"
              onClick={() => setDetailsOpen((value) => !value)}
            >
              <PanelRight className="size-4" />
              Detalhes
            </Button>
          </div>
        </div>
        {selectedIds.size > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-border bg-secondary/40 px-4 py-2">
            <p className="mr-2 text-sm font-medium">{selectedIds.size} seleccionado(s)</p>
            {canWrite ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() => setMoveOpen(true)}
              >
                Mover
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setSelectedIds(new Set())}
            >
              Limpar selecção
            </Button>
          </div>
        ) : null}
        {selected ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-border bg-secondary/40 px-4 py-2">
            <FileKindIcon kind={selected.kind} visibility={selected.visibility} size="sm" />
            <p className="mr-2 min-w-0 flex-1 truncate text-sm font-medium">{selected.name}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1"
              disabled={!selectedContentOpen}
              title={selectedContentOpen ? undefined : SYSTEM_LOCKED_MSG}
              onClick={() => {
                if (!selectedContentOpen) {
                  toast.error(SYSTEM_LOCKED_MSG);
                  return;
                }
                void downloadRecord(selected).catch((error) => toast.error(error.message));
              }}
            >
              <Download className="size-3.5" />
              Descarregar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1"
              onClick={() => {
                void navigator.clipboard
                  .writeText(schoolFileShareText(selected))
                  .then(() => toast.success("Referência copiada"))
                  .catch((error: Error) => toast.error(error.message));
              }}
            >
              <Copy className="size-3.5" />
              Copiar
            </Button>
            {canWrite && selectedCanManage ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={() => void renameSelected()}
                >
                  <Pencil className="size-3.5" />
                  Renomear
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={() => void removeSelected()}
                >
                  <Trash2 className="size-3.5" />
                  Apagar
                </Button>
              </>
            ) : null}
            <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedId(null)}>
              Limpar
            </Button>
          </div>
        ) : null}
      </header>

      <div
        className={cn(
          "grid min-h-[28rem]",
          detailsOpen ? "lg:grid-cols-[200px_minmax(0,1fr)_280px]" : "md:grid-cols-[200px_1fr]",
        )}
      >
        <FileBrowserNav
          areas={areas}
          area={area}
          driveOn={driveOn}
          onSelectArea={(nextArea) => {
            setArea(nextArea);
            setSelectedId(null);
            setFolderId(null);
            setSelectedIds(new Set());
          }}
        />

        <div className="flex min-h-0 min-w-0 flex-col border-b border-border lg:border-b-0 lg:border-r">
          <div className="space-y-2 border-b border-border px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[12rem] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={`Procurar nome ou ID (${documentCodeSearchHint()})`}
                  className="h-9 pl-9"
                  aria-label="Procurar arquivo por nome ou ID"
                />
              </div>
              {!lockedClassId && classOptions.length > 0 ? (
                <select
                  value={classFilter}
                  onChange={(event) => {
                    setClassFilter(event.target.value);
                    setSelectedId(null);
                  }}
                  className="h-9 max-w-[12rem] rounded-md border border-input bg-background px-2 text-sm"
                  aria-label="Filtrar por turma"
                >
                  <option value="all">Todas as turmas</option>
                  {classOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.code ? ` (${item.code})` : ""}
                    </option>
                  ))}
                </select>
              ) : null}
              <select
                value={categoryFilter}
                onChange={(event) =>
                  setCategoryFilter(
                    event.target.value as (typeof fileCategoryOptions)[number] | "all",
                  )
                }
                className="h-9 max-w-[11rem] rounded-md border border-input bg-background px-2 text-sm"
                aria-label="Filtrar por categoria"
              >
                <option value="all">Todas categorias</option>
                {fileCategoryOptions.map((value) => (
                  <option key={value} value={value}>
                    {fileCategoryMeta[value].label}
                  </option>
                ))}
              </select>
              <select
                value={relatedUserFilter}
                onChange={(event) => setRelatedUserFilter(event.target.value)}
                className="h-9 max-w-[12rem] rounded-md border border-input bg-background px-2 text-sm"
                aria-label="Filtrar por utilizador relacionado"
              >
                <option value="all">Qualquer utilizador</option>
                {(usersQuery.data?.users ?? []).map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
              {canUpload ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-2 font-semibold px-4"
                    disabled={uploading || pendingFiles.length > 0}
                    onClick={() => inputRef.current?.click()}
                  >
                    <Upload className="size-4" /> Carregar
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        size="sm"
                        className="gap-2 bg-primary text-primary-foreground shadow-md hover:shadow-lg rounded-xl font-semibold px-4"
                        disabled={uploading || pendingFiles.length > 0}
                      >
                        <Plus className="size-4" />
                        {uploading ? "A guardar…" : "Novo"}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => void createFolder()} className="gap-2">
                        <FolderPlus className="size-4 text-warning" /> Nova Pasta
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => inputRef.current?.click()} className="gap-2">
                        <Upload className="size-4 text-primary" /> Carregar Ficheiros
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => cameraRef.current?.click()}
                        className="gap-2"
                      >
                        <Camera className="size-4 text-primary" /> Tirar fotografia
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <input
                    ref={inputRef}
                    type="file"
                    aria-label="Seleccionar arquivos para carregar"
                    accept={uploadAccept}
                    multiple
                    className="sr-only"
                    onChange={(event) => {
                      const files = Array.from(event.currentTarget.files ?? []);
                      event.currentTarget.value = "";
                      void uploadFiles(files);
                    }}
                  />
                  <input
                    ref={cameraRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    aria-label="Tirar fotografia para carregar"
                    className="sr-only"
                    onChange={(event) => {
                      const files = Array.from(event.currentTarget.files ?? []);
                      event.currentTarget.value = "";
                      void uploadFiles(files);
                    }}
                  />
                </>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por tipo">
              <button
                type="button"
                onClick={() => setKindFilter("all")}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  kindFilter === "all"
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground",
                )}
              >
                Todos
              </button>
              {kindChoices.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setKindFilter(kind)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
                    kindFilter === kind
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:text-foreground",
                  )}
                >
                  {fileKindMeta[kind].label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setNeedsOrganizeOnly((value) => !value)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  needsOrganizeOnly
                    ? "bg-warning text-warning-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground",
                )}
              >
                Por organizar{disorganizedCount ? ` · ${disorganizedCount}` : ""}
              </button>
              <button
                type="button"
                onClick={() => setOwnershipFilter((value) => (value === "mine" ? "all" : "mine"))}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  ownershipFilter === "mine"
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground",
                )}
              >
                Meus
              </button>
              <button
                type="button"
                onClick={() =>
                  setOwnershipFilter((value) => (value === "system" ? "all" : "system"))
                }
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  ownershipFilter === "system"
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground",
                )}
              >
                Sistema
              </button>
            </div>
          </div>

          <div className={cn("relative min-h-0 flex-1 overflow-auto p-0")}>
            {localOnly ? (
              <p className="m-4 rounded-xl border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
                Tabela SGA ainda não aplicada. Os ficheiros ficam neste dispositivo até correr{" "}
                <code className="text-[11px]">APPLY_ENROLLMENT_AND_PREMIUM.sql</code> (inclui{" "}
                <code className="text-[11px]">siga_file_events</code>). <SqlChecklistLink />
              </p>
            ) : null}
            {remoteQuery.isLoading ? (
              <p className="p-4 text-sm text-muted-foreground">A carregar metadados…</p>
            ) : files.length === 0 ? (
              <p className="m-4 rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                Nenhum ficheiro nesta área
                {kindFilter !== "all" ? ` (${fileKindMeta[kindFilter].label})` : ""}
                {activeClassId ? " para esta turma" : ""}.
              </p>
            ) : viewMode === "grid" ? (
              <FileBrowserGrid
                files={files}
                selectedId={selectedId}
                selectedIds={selectedIds}
                previewUrlById={previewUrlById}
                uploadProgress={uploadProgress}
                account={account}
                pickMode={pickMode}
                systemLockedMsg={SYSTEM_LOCKED_MSG}
                onPick={onPick}
                onSelectId={(id) => setSelectedId(id)}
                onToggleSelect={(id, checked) => toggleSelect(id, checked)}
                onOpenRecord={(file) => {
                  void openRecord(file).catch((error) => toast.error(error.message));
                }}
                onFolderDoubleClick={(folderId) => {
                  setFolderId(folderId);
                  setSelectedIds(new Set());
                }}
              />
            ) : (
              <FileBrowserTable
                files={files}
                selectedId={selectedId}
                selectedIds={selectedIds}
                uploadProgress={uploadProgress}
                account={account}
                pickMode={pickMode}
                systemLockedMsg={SYSTEM_LOCKED_MSG}
                onPick={onPick}
                onSelectId={(id) => setSelectedId(id)}
                onToggleSelect={(id, checked) => toggleSelect(id, checked)}
                onOpenRecord={(file) => {
                  void openRecord(file).catch((error) => toast.error(error.message));
                }}
                onFolderDoubleClick={(folderId) => {
                  setFolderId(folderId);
                  setSelectedIds(new Set());
                }}
              />
            )}
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-secondary/30 px-4 py-3">
            <p className="text-xs text-muted-foreground">
              {selected
                ? selected.name
                : `${files.length} ficheiro${files.length === 1 ? "" : "s"} · só metadados na lista`}
            </p>
            <div className="flex flex-wrap gap-2">
              {selected && canWrite && selectedCanManage ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1"
                    onClick={() => void renameSelected()}
                  >
                    <Pencil className="size-4" />
                    Renomear
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1"
                    onClick={() => void removeSelected()}
                  >
                    <Trash2 className="size-4" />
                    Apagar
                  </Button>
                </>
              ) : null}
              {selected ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1"
                    disabled={!selectedContentOpen}
                    title={selectedContentOpen ? undefined : SYSTEM_LOCKED_MSG}
                    onClick={() => {
                      if (!selectedContentOpen) {
                        toast.error(SYSTEM_LOCKED_MSG);
                        return;
                      }
                      void downloadRecord(selected).catch((error) => toast.error(error.message));
                    }}
                  >
                    <Download className="size-4" />
                    Descarregar
                  </Button>
                  <Button
                    type="button"
                    variant={pickMode ? "outline" : "default"}
                    size="sm"
                    disabled={!selectedContentOpen && !(pickMode && onPick)}
                    onClick={() => {
                      if (pickMode && onPick) {
                        if (!selectedContentOpen) {
                          toast.error(SYSTEM_LOCKED_MSG);
                          return;
                        }
                        onPick(selected);
                        return;
                      }
                      if (!selectedContentOpen) {
                        toast.error(SYSTEM_LOCKED_MSG);
                        return;
                      }
                      void openRecord(selected).catch((error) => toast.error(error.message));
                    }}
                  >
                    Abrir
                  </Button>
                </>
              ) : null}
              {pickMode && selected && onPick ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={!selectedContentOpen}
                  title={selectedContentOpen ? undefined : SYSTEM_LOCKED_MSG}
                  onClick={() => {
                    if (!selectedContentOpen) {
                      toast.error(SYSTEM_LOCKED_MSG);
                      return;
                    }
                    onPick(selected);
                  }}
                >
                  Escolher
                </Button>
              ) : null}
            </div>
          </footer>
        </div>

        {detailsOpen ? (
          <FileDetailsPanel
            selected={selected}
            previewUrl={previewUrl}
            myAccess={myAccess}
            selectedContentOpen={selectedContentOpen}
            selectedCanManage={selectedCanManage}
            systemLockedMsg={SYSTEM_LOCKED_MSG}
            activityLoading={activityQuery.isLoading}
            activityEvents={activityQuery.data?.events ?? []}
            onChangeVisibility={(visibility) => void changeVisibility(visibility)}
            onOrganize={(file) => setOrganizeTarget(file)}
            onEditMeta={() => void saveSelectedMeta()}
          />
        ) : null}
      </div>
      <FileUploadInquiryModal
        open={pendingFiles.length > 0}
        files={pendingFiles}
        defaultVisibility={defaultVisibilityForArea(area)}
        defaultArea={area}
        writableAreas={writableAreas}
        currentUserId={account.id}
        initial={
          initialRelatedPersonId
            ? {
                relatedPersonId: initialRelatedPersonId,
                visibility: "private",
                area: "secretaria",
              }
            : undefined
        }
        lockRelatedPerson={Boolean(initialRelatedPersonId)}
        onCancel={() => setPendingFiles([])}
        onConfirm={(meta) => void commitUpload(meta)}
      />
      <MoveItemsDialog
        open={moveOpen}
        count={selectedIds.size}
        area={area}
        folders={(foldersQuery.data?.files ?? []).filter(
          (item) => item.isFolder && !selectedIds.has(item.id),
        )}
        onCancel={() => setMoveOpen(false)}
        onConfirm={(parentId) => void commitMove(parentId)}
      />
      <FileUploadInquiryModal
        open={Boolean(organizeTarget)}
        files={[]}
        mode="organize"
        defaultVisibility={organizeTarget?.visibility ?? defaultVisibilityForArea(area)}
        defaultArea={organizeTarget?.area ?? area}
        writableAreas={writableAreas}
        currentUserId={account.id}
        {...(organizeTarget
          ? {
              initial: {
                name: organizeTarget.name,
                title: organizeTarget.title ?? organizeTarget.name,
                description: organizeTarget.description ?? "",
                category: organizeTarget.category ?? "outro",
                documentDate: organizeTarget.documentDate ?? undefined,
                referenceCode: organizeTarget.referenceCode ?? undefined,
                relatedUserId: organizeTarget.relatedUserId,
                relatedPersonId: organizeTarget.relatedPersonId,
                visibility: organizeTarget.visibility,
                area: organizeTarget.area,
                applyAsProfilePhoto: organizeTarget.category === "foto",
              },
            }
          : {})}
        onCancel={() => setOrganizeTarget(null)}
        onConfirm={(meta) => void commitOrganize(meta)}
      />
    </div>
  );
}
