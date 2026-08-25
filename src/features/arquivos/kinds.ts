import {
  allowedFileMimes,
  FILE_MAX_BYTES,
  fileAreaOptions,
  fileCategoryOptions,
  fileKindOptions,
  fileVisibilityOptions,
} from "./schemas";

export type FileKind = (typeof fileKindOptions)[number];
export type FileArea = (typeof fileAreaOptions)[number];
export type FileVisibility = (typeof fileVisibilityOptions)[number];
export type FileCategory = (typeof fileCategoryOptions)[number];

const mimeToKind: Record<string, FileKind> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
  "image/pjpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "application/msword": "word",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "word",
  "application/vnd.ms-excel": "excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "excel",
  "application/vnd.ms-powerpoint": "powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "powerpoint",
  "text/csv": "csv",
  "application/csv": "csv",
  "text/comma-separated-values": "csv",
};

const extensionToKind: Record<string, FileKind> = {
  pdf: "pdf",
  jpg: "jpeg",
  jpeg: "jpeg",
  jpe: "jpeg",
  png: "png",
  webp: "webp",
  gif: "gif",
  svg: "svg",
  doc: "word",
  docx: "word",
  xls: "excel",
  xlsx: "excel",
  ppt: "powerpoint",
  pptx: "powerpoint",
  csv: "csv",
};

export const fileKindMeta: Record<
  FileKind,
  {
    label: string;
    color: string;
    accept: string;
    family: "documento" | "imagem" | "dados" | "pasta";
  }
> = {
  folder: { label: "Pasta", color: "#CA8A04", accept: "", family: "pasta" },
  pdf: { label: "PDF", color: "#DC2626", accept: ".pdf,application/pdf", family: "documento" },
  word: { label: "Word", color: "#2563EB", accept: ".doc,.docx", family: "documento" },
  excel: { label: "Excel", color: "#15803D", accept: ".xls,.xlsx", family: "dados" },
  powerpoint: {
    label: "PowerPoint",
    color: "#C2410C",
    accept: ".ppt,.pptx",
    family: "documento",
  },
  csv: { label: "CSV", color: "#0F766E", accept: ".csv,text/csv", family: "dados" },
  png: { label: "PNG", color: "#7C3AED", accept: ".png,image/png", family: "imagem" },
  jpeg: { label: "JPEG", color: "#D97706", accept: ".jpg,.jpeg,image/jpeg", family: "imagem" },
  webp: { label: "WebP", color: "#0891B2", accept: ".webp,image/webp", family: "imagem" },
  gif: { label: "GIF", color: "#DB2777", accept: ".gif,image/gif", family: "imagem" },
  svg: { label: "SVG / ícone", color: "#4F46E5", accept: ".svg,image/svg+xml", family: "imagem" },
};

export const fileAreaMeta: Record<
  FileArea,
  { label: string; description: string; reserved?: boolean }
> = {
  escola: {
    label: "Biblioteca da escola",
    description: "Materiais partilhados com o corpo da escola.",
  },
  secretaria: {
    label: "Secretaria",
    description: "Área reservada à secretaria e à administração.",
    reserved: true,
  },
  pessoal: {
    label: "Os meus arquivos",
    description: "Ficheiros privados deste colaborador, neste dispositivo ou no SGA.",
  },
  publico: {
    label: "Públicos",
    description: "Ficheiros que a escola pode ligar em páginas e talões.",
  },
};

export const fileCategoryMeta: Record<FileCategory, { label: string }> = {
  bilhete: { label: "BI / identificação" },
  certificado: { label: "Certificado / diploma" },
  contrato: { label: "Contrato" },
  fatura: { label: "Fatura" },
  recibo: { label: "Recibo" },
  talao: { label: "Talão de pagamento" },
  pauta: { label: "Pauta / notas" },
  comunicado: { label: "Comunicado" },
  material_aula: { label: "Material de aula" },
  foto: { label: "Fotografia" },
  outro: { label: "Outro" },
};

export const FILE_DESCRIPTION_MIN = 12;

export const fileAcceptAttr = [
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".svg",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".csv",
  ...allowedFileMimes,
].join(",");

export function kindFromFile(name: string, mime: string): FileKind | null {
  const normalizedMime = mime.toLowerCase().split(";")[0]?.trim() ?? "";
  const fromMime = mimeToKind[normalizedMime];
  if (fromMime) return fromMime;
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return extensionToKind[ext] ?? null;
}

export function isImageFileFamily(kind: FileKind) {
  return fileKindMeta[kind].family === "imagem";
}

export function isAllowedSchoolFile(file: { name: string; type: string; size: number }) {
  if (file.size <= 0 || file.size > FILE_MAX_BYTES) {
    return {
      ok: false as const,
      error: `O ficheiro deve ter até ${FILE_MAX_BYTES / (1024 * 1024)} MB.`,
    };
  }
  if (!kindFromFile(file.name, file.type)) {
    return {
      ok: false as const,
      error: "Formato fora do padrão SIGA. Use PDF, Office, CSV, PNG, JPEG, WebP, GIF ou SVG.",
    };
  }
  return { ok: true as const };
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function defaultVisibilityForArea(area: FileArea): FileVisibility {
  if (area === "publico") return "public";
  if (area === "escola") return "school";
  return "private";
}

export function canReadFileArea(role: string, area: FileArea) {
  if (area === "secretaria") return role === "Administrador" || role === "Secretaria";
  return ["Administrador", "Secretaria", "Tesouraria", "Professor"].includes(role);
}

export function canWriteFileArea(role: string, area: FileArea) {
  if (area === "pessoal") {
    return ["Administrador", "Secretaria", "Tesouraria", "Professor"].includes(role);
  }
  if (area === "secretaria" || area === "escola" || area === "publico") {
    return role === "Administrador" || role === "Secretaria";
  }
  return false;
}

export function visibleAreasForRole(role: string): FileArea[] {
  return (["escola", "secretaria", "pessoal", "publico"] as const).filter((area) =>
    canReadFileArea(role, area),
  );
}

export function writableAreasForRole(role: string): FileArea[] {
  return visibleAreasForRole(role).filter((area) => canWriteFileArea(role, area));
}

export type FileMyAccess = "owner" | "edit" | "view";

export const fileVisibilityMeta: Record<
  FileVisibility,
  { label: string; short: string; description: string }
> = {
  private: {
    label: "Privado",
    short: "Privado",
    description: "Só o proprietário vê; Admin/Secretaria na área reservada.",
  },
  school: {
    label: "Escola",
    short: "Escola",
    description: "Partilhado com quem tem acesso a esta área.",
  },
  public: {
    label: "Público",
    short: "Público",
    description: "Pode ser ligado em páginas, talões e materiais da escola.",
  },
};

export const fileMyAccessMeta: Record<FileMyAccess, { label: string; tone: string }> = {
  owner: { label: "Proprietário", tone: "text-primary" },
  edit: { label: "Pode editar", tone: "text-foreground" },
  view: { label: "Só leitura", tone: "text-muted-foreground" },
};

export function myFileAccess(
  file: { ownerUserId: string; area: FileArea },
  userId: string,
  role: string,
): FileMyAccess {
  if (file.ownerUserId === userId) return "owner";
  if (canWriteFileArea(role, file.area)) return "edit";
  return "view";
}

export function formatFileWhen(iso: string | null | undefined) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const now = Date.now();
  const diff = now - date.getTime();
  const day = 86_400_000;
  if (diff < 60_000) return "Agora";
  if (diff < 3_600_000) return `Há ${Math.max(1, Math.round(diff / 60_000))} min`;
  if (diff < day) return `Há ${Math.max(1, Math.round(diff / 3_600_000))} h`;
  if (diff < 7 * day) return `Há ${Math.max(1, Math.round(diff / day))} d`;
  return date.toLocaleDateString("pt-AO", {
    day: "numeric",
    month: "short",
    timeZone: "Africa/Luanda",
  });
}

export const fileActionLabels: Record<string, string> = {
  created: "criou",
  renamed: "renomeou",
  deleted: "apagou",
  opened: "abriu",
  downloaded: "descarregou",
  visibility_changed: "alterou o acesso",
  linked_class: "ligou à turma",
  unlinked_class: "desligou da turma",
  metadata_updated: "actualizou metadados",
  moved: "moveu",
  folder_created: "criou pasta",
};

export function formatFileActivityLine(input: {
  action?: string | null;
  actorName?: string | null;
  at?: string | null;
  fallbackCreatedAt?: string;
  fallbackOwnerName?: string | null;
}) {
  if (input.action && input.actorName) {
    const verb = fileActionLabels[input.action] ?? input.action;
    return `${input.actorName} ${verb} · ${formatFileWhen(input.at)}`;
  }
  if (input.fallbackOwnerName && input.fallbackCreatedAt) {
    return `${input.fallbackOwnerName} criou · ${formatFileWhen(input.fallbackCreatedAt)}`;
  }
  return formatFileWhen(input.fallbackCreatedAt ?? input.at);
}

/** Ficheiro fora do padrão SIGA: falta descrição útil ou classificação. */
export function fileNeedsOrganization(file: {
  title?: string | null;
  description?: string | null;
  category?: FileCategory | null;
}) {
  const description = file.description?.trim() ?? "";
  if (description.length < FILE_DESCRIPTION_MIN) return true;
  if (!file.category) return true;
  const title = file.title?.trim() ?? "";
  if (!title) return true;
  return false;
}

export function suggestFileCategory(input: { name: string; kind: FileKind | null }): FileCategory {
  const n = input.name.toLowerCase();
  if (input.kind && isImageFileFamily(input.kind)) {
    if (/logo|brasao|brasão|icon|ícone|emblema|selo/.test(n) || input.kind === "svg") {
      return "outro";
    }
    return "foto";
  }
  if (/bilhete|bi[-_\s]|passaporte|nif|identifica/.test(n)) return "bilhete";
  if (/certific|diploma|habilita|matricula|matrícula|declara/.test(n)) return "certificado";
  if (/contrato|acordo/.test(n)) return "contrato";
  if (/fatura|factura|invoice/.test(n)) return "fatura";
  if (/recibo|talao|talão/.test(n))
    return /talao|talão|plano|gateway|multicaixa|unitel/.test(n) ? "talao" : "recibo";
  if (/pauta|notas|boletim|mapa/.test(n)) return "pauta";
  if (/comunic|aviso|circular/.test(n)) return "comunicado";
  if (/aula|material|ficha|powerpoint|apresenta|slides/.test(n)) return "material_aula";
  if (input.kind === "powerpoint") return "material_aula";
  if (input.kind === "excel" || input.kind === "csv") return "pauta";
  return "outro";
}

export function suggestFileArea(
  category: FileCategory,
  writable: readonly FileArea[],
  preferred?: FileArea,
): FileArea {
  const pick = (candidates: FileArea[]) =>
    candidates.find((area) => writable.includes(area)) ??
    (preferred && writable.includes(preferred) ? preferred : undefined) ??
    writable[0] ??
    "pessoal";

  if (category === "foto" || category === "bilhete" || category === "certificado") {
    return pick(["secretaria", "escola", "pessoal"]);
  }
  if (
    category === "fatura" ||
    category === "recibo" ||
    category === "contrato" ||
    category === "talao"
  ) {
    return pick(["secretaria", "escola", "pessoal"]);
  }
  if (category === "comunicado") {
    return pick(["publico", "escola", "pessoal"]);
  }
  if (category === "material_aula" || category === "pauta") {
    return pick(["escola", "pessoal", "secretaria"]);
  }
  return pick([preferred ?? "escola", "pessoal", "escola", "secretaria", "publico"]);
}
