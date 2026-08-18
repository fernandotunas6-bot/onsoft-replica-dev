import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogExpandButton, useExpandableDialog } from "./dialog-expand";
import { documentCodeSearchHint, generateDocumentCode, prefixForCategory } from "./document-code";
import {
  defaultVisibilityForArea,
  FILE_DESCRIPTION_MIN,
  fileAreaMeta,
  fileCategoryMeta,
  fileVisibilityMeta,
  formatFileSize,
  isImageFileFamily,
  kindFromFile,
  suggestFileArea,
  suggestFileCategory,
  type FileArea,
} from "./kinds";
import {
  fileCategoryOptions,
  fileVisibilityOptions,
  type FileMetaFields,
  type SchoolFileRecord,
} from "./schemas";
import {
  listArquivosPersonOptions,
  listArquivosStudentOptions,
  listArquivosUserOptions,
} from "./server";

export type UploadInquiryResult = FileMetaFields & {
  visibility: SchoolFileRecord["visibility"];
  area: FileArea;
  applyAsProfilePhoto?: boolean | undefined;
};

function defaultTitleFromName(name: string) {
  return name.replace(/\.[^.]+$/, "").trim() || name;
}

function filesLookLikePhotos(files: File[]) {
  if (!files.length) return false;
  return files.every((file) => {
    const kind = kindFromFile(file.name, file.type);
    return kind != null && isImageFileFamily(kind) && kind !== "svg";
  });
}

export function FileUploadInquiryModal({
  open,
  files,
  defaultVisibility,
  defaultArea,
  writableAreas,
  mode = "upload",
  initial,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  files: File[];
  defaultVisibility: SchoolFileRecord["visibility"];
  defaultArea: FileArea;
  writableAreas: readonly FileArea[];
  mode?: "upload" | "organize";
  initial?: Partial<UploadInquiryResult> & { name?: string };
  onCancel: () => void;
  onConfirm: (meta: UploadInquiryResult) => void;
}) {
  const firstName = files[0]?.name ?? initial?.name ?? "documento";
  const photoLike = useMemo(() => filesLookLikePhotos(files), [files]);
  const firstKind = useMemo(
    () =>
      files[0]
        ? kindFromFile(files[0].name, files[0].type)
        : initial?.category === "foto"
          ? ("jpeg" as const)
          : null,
    [files, initial?.category],
  );
  const suggestedCategory = useMemo(
    () => initial?.category ?? suggestFileCategory({ name: firstName, kind: firstKind }),
    [firstKind, firstName, initial?.category],
  );
  const suggestedArea = useMemo(
    () => initial?.area ?? suggestFileArea(suggestedCategory, writableAreas, defaultArea),
    [defaultArea, initial?.area, suggestedCategory, writableAreas],
  );

  const [title, setTitle] = useState(defaultTitleFromName(firstName));
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<(typeof fileCategoryOptions)[number]>(suggestedCategory);
  const [documentDate, setDocumentDate] = useState("");
  const [referenceCode, setReferenceCode] = useState("");
  const [area, setArea] = useState<FileArea>(suggestedArea);
  const [visibility, setVisibility] = useState<SchoolFileRecord["visibility"]>(defaultVisibility);
  const [relatedUserId, setRelatedUserId] = useState("");
  const [relatedPersonId, setRelatedPersonId] = useState("");
  const [personQuery, setPersonQuery] = useState("");
  const [debouncedPersonQuery, setDebouncedPersonQuery] = useState("");
  const [applyAsProfilePhoto, setApplyAsProfilePhoto] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  const isPhotoCategory = category === "foto";
  const areas = writableAreas.length ? writableAreas : ([defaultArea] as FileArea[]);
  const { expanded, toggleExpanded, contentClassName } = useExpandableDialog();

  useEffect(() => {
    if (!open) return;
    const nextCategory =
      initial?.category ??
      (photoLike ? "foto" : suggestFileCategory({ name: firstName, kind: firstKind }));
    const nextArea = initial?.area ?? suggestFileArea(nextCategory, writableAreas, defaultArea);
    setTitle(initial?.title?.trim() || defaultTitleFromName(firstName));
    setDescription(initial?.description?.trim() || "");
    setCategory(nextCategory);
    setDocumentDate(initial?.documentDate || "");
    setReferenceCode(
      initial?.referenceCode?.trim() || generateDocumentCode(prefixForCategory(nextCategory)),
    );
    setArea(nextArea);
    setVisibility(initial?.visibility ?? defaultVisibilityForArea(nextArea) ?? defaultVisibility);
    setRelatedUserId(initial?.relatedUserId || "");
    setRelatedPersonId(initial?.relatedPersonId || "");
    setPersonQuery("");
    setApplyAsProfilePhoto(initial?.applyAsProfilePhoto ?? true);
    setFormError(null);
  }, [
    defaultArea,
    defaultVisibility,
    firstKind,
    firstName,
    initial,
    open,
    photoLike,
    writableAreas,
  ]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedPersonQuery(personQuery), 220);
    return () => window.clearTimeout(timer);
  }, [personQuery]);

  const usersQuery = useQuery({
    queryKey: ["arquivos", "user-options"],
    enabled: open,
    queryFn: () => listArquivosUserOptions(),
    staleTime: 60_000,
  });

  const peopleQuery = useQuery({
    queryKey: ["arquivos", "person-options", debouncedPersonQuery],
    enabled: open && !isPhotoCategory,
    queryFn: () =>
      listArquivosPersonOptions({
        data: { query: debouncedPersonQuery || undefined, limit: 24 },
      }),
    staleTime: 30_000,
  });

  const studentsQuery = useQuery({
    queryKey: ["arquivos", "student-options", debouncedPersonQuery],
    enabled: open && isPhotoCategory,
    queryFn: () =>
      listArquivosStudentOptions({
        data: { query: debouncedPersonQuery || undefined, limit: 24 },
      }),
    staleTime: 30_000,
  });

  const totalBytes = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent
        className={contentClassName(
          "max-h-[min(90vh,720px)] w-[min(560px,calc(100vw-1.5rem))] max-w-none gap-0 overflow-hidden p-0 sm:rounded-2xl",
        )}
      >
        <DialogExpandButton expanded={expanded} onToggle={toggleExpanded} />
        <div className="border-b border-border px-5 py-4 pr-20">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <ClipboardList className="size-5 text-primary" />
            {mode === "organize"
              ? "Organizar ficheiro"
              : isPhotoCategory
                ? "Fotografia do aluno"
                : "Inquérito do documento"}
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm">
            {mode === "organize"
              ? "Complete a descrição e o destino da área. Nenhum media fica fora do padrão SIGA."
              : isPhotoCategory
                ? "Associe a imagem a um aluno e indique a área de destino."
                : `Descreva o ficheiro e escolha a área${
                    files.length > 1
                      ? ` (${files.length} ficheiros · ${formatFileSize(totalBytes)})`
                      : ""
                  }.`}
          </DialogDescription>
        </div>
        <div className="max-h-[min(58vh,480px)] space-y-3 overflow-y-auto px-5 py-4">
          <div className="rounded-xl border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
            {files.length ? (
              files.map((file) => (
                <p key={`${file.name}-${file.size}`} className="truncate">
                  {file.name} · {formatFileSize(file.size)}
                  {kindFromFile(file.name, file.type)
                    ? ` · ${kindFromFile(file.name, file.type)}`
                    : ""}
                </p>
              ))
            ) : (
              <p className="truncate">{firstName}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="file-meta-title">Título</Label>
            <Input
              id="file-meta-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={180}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="file-meta-desc">
              Descrição <span className="text-destructive">*</span>
            </Label>
            <textarea
              id="file-meta-desc"
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                setFormError(null);
              }}
              rows={3}
              maxLength={800}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder={`Obrigatória · mínimo ${FILE_DESCRIPTION_MIN} caracteres (contexto, uso, destinatário)`}
            />
            <p className="text-[11px] text-muted-foreground">
              {description.trim().length}/{FILE_DESCRIPTION_MIN} mínimos
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="file-meta-category">Categoria</Label>
              <select
                id="file-meta-category"
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={category}
                onChange={(event) => {
                  const next = event.target.value as (typeof fileCategoryOptions)[number];
                  setCategory(next);
                  setRelatedPersonId("");
                  setFormError(null);
                  if (next === "foto") setApplyAsProfilePhoto(true);
                  setArea(suggestFileArea(next, areas, area));
                  setVisibility(defaultVisibilityForArea(suggestFileArea(next, areas, area)));
                  setReferenceCode(generateDocumentCode(prefixForCategory(next)));
                }}
              >
                {fileCategoryOptions.map((value) => (
                  <option key={value} value={value}>
                    {fileCategoryMeta[value].label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="file-meta-area">
                Área de destino <span className="text-destructive">*</span>
              </Label>
              <select
                id="file-meta-area"
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={area}
                onChange={(event) => {
                  const next = event.target.value as FileArea;
                  setArea(next);
                  setVisibility(defaultVisibilityForArea(next));
                }}
              >
                {areas.map((value) => (
                  <option key={value} value={value}>
                    {fileAreaMeta[value].label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">{fileAreaMeta[area].description}</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="file-meta-date">
                {isPhotoCategory ? "Data da foto" : "Data do documento"}
              </Label>
              <Input
                id="file-meta-date"
                type="date"
                value={documentDate}
                onChange={(event) => setDocumentDate(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="file-meta-ref">ID do documento</Label>
              <Input
                id="file-meta-ref"
                value={referenceCode}
                onChange={(event) => setReferenceCode(event.target.value.toUpperCase())}
                placeholder={documentCodeSearchHint()}
                maxLength={40}
                className="font-mono text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Padrão PREFIX-AAMMDD-XXXX para pesquisa rápida na biblioteca.
              </p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="file-meta-visibility">Nível de acesso</Label>
            <select
              id="file-meta-visibility"
              className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={visibility}
              onChange={(event) =>
                setVisibility(event.target.value as SchoolFileRecord["visibility"])
              }
            >
              {fileVisibilityOptions.map((value) => (
                <option key={value} value={value}>
                  {fileVisibilityMeta[value].label}
                </option>
              ))}
            </select>
          </div>
          {!isPhotoCategory ? (
            <div className="space-y-1.5">
              <Label htmlFor="file-meta-user">Relacionar a utilizador (conta SIGA)</Label>
              <select
                id="file-meta-user"
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={relatedUserId}
                onChange={(event) => setRelatedUserId(event.target.value)}
              >
                <option value="">Nenhum</option>
                {(usersQuery.data?.users ?? []).map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="file-meta-person-q">
              {isPhotoCategory ? "Aluno (obrigatório)" : "Relacionar a pessoa (registo)"}
            </Label>
            <Input
              id="file-meta-person-q"
              value={personQuery}
              onChange={(event) => setPersonQuery(event.target.value)}
              placeholder={
                isPhotoCategory
                  ? "Procurar por nome ou nº de processo…"
                  : "Procurar aluno, encarregado, docente…"
              }
            />
            <select
              className="mt-1.5 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={relatedPersonId}
              onChange={(event) => {
                setRelatedPersonId(event.target.value);
                setFormError(null);
              }}
              aria-label={isPhotoCategory ? "Aluno relacionado" : "Pessoa relacionada"}
            >
              <option value="">{isPhotoCategory ? "Seleccione o aluno…" : "Nenhuma"}</option>
              {isPhotoCategory
                ? (studentsQuery.data?.students ?? []).map((student) => (
                    <option key={student.personId} value={student.personId}>
                      {student.name}
                      {student.registrationNumber ? ` · ${student.registrationNumber}` : ""}
                    </option>
                  ))
                : (peopleQuery.data?.people ?? []).map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                      {person.email ? ` · ${person.email}` : ""}
                    </option>
                  ))}
            </select>
          </div>
          {isPhotoCategory ? (
            <label className="flex items-start gap-2 rounded-xl border border-border bg-primary/5 px-3 py-2.5 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                aria-label="Usar como foto de perfil"
                checked={applyAsProfilePhoto}
                onChange={(event) => setApplyAsProfilePhoto(event.target.checked)}
              />
              <span>
                <span className="font-medium text-foreground">Usar como foto de perfil</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Só PNG/JPEG são aplicados na ficha; WebP/GIF ficam na biblioteca ligados ao aluno.
                </span>
              </span>
            </label>
          ) : null}
          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
        </div>
        <DialogFooter className="border-t border-border bg-secondary/30 px-5 py-3">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => {
              const trimmedDescription = description.trim();
              if (trimmedDescription.length < FILE_DESCRIPTION_MIN) {
                setFormError(
                  `Indique uma descrição com pelo menos ${FILE_DESCRIPTION_MIN} caracteres.`,
                );
                return;
              }
              if (isPhotoCategory && !relatedPersonId) {
                setFormError("Seleccione o aluno a quem a fotografia pertence.");
                return;
              }
              if (isPhotoCategory && mode === "upload" && !photoLike && files.length) {
                setFormError("Fotografias de aluno devem ser PNG, JPEG, WebP ou GIF.");
                return;
              }
              if (!areas.includes(area)) {
                setFormError("Escolha uma área de destino permitida.");
                return;
              }
              const trimmed = title.trim() || defaultTitleFromName(firstName);
              onConfirm({
                title: trimmed,
                description: trimmedDescription,
                category,
                documentDate: documentDate || undefined,
                referenceCode: referenceCode.trim() || undefined,
                relatedUserId: isPhotoCategory ? null : relatedUserId || null,
                relatedPersonId: relatedPersonId || null,
                visibility,
                area,
                applyAsProfilePhoto: isPhotoCategory ? applyAsProfilePhoto : undefined,
              });
            }}
          >
            {mode === "organize"
              ? "Guardar organização"
              : `Guardar ficheiro${files.length > 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
