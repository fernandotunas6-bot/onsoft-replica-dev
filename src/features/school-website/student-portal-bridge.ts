import { getPlatformDomain, LEGACY_PLATFORM_DOMAIN } from "@/lib/saas/platform-domain";

export const studentPortalSections = [
  "",
  "disciplinas",
  "notas",
  "horarios",
  "candidaturas",
  "financeiro",
  "documentos",
  "pedidos",
  "perfil",
] as const;
export type StudentPortalSection = (typeof studentPortalSections)[number];
export type StudentPortalRequest = {
  type: "siga-student-request";
  version: 1;
  requestId: string;
  schoolSlug: string;
  section: StudentPortalSection;
  action?: "signout";
};
export function isStudentPortalRequest(
  event: MessageEvent,
  frame: Window | null,
  origin: string,
  schoolSlug: string,
): event is MessageEvent<StudentPortalRequest> {
  const value = event.data;
  return Boolean(
    frame &&
    event.source === frame &&
    event.origin === origin &&
    value &&
    value.type === "siga-student-request" &&
    value.version === 1 &&
    value.schoolSlug === schoolSlug &&
    typeof value.requestId === "string" &&
    /^[a-f0-9-]{16,80}$/i.test(value.requestId) &&
    studentPortalSections.includes(value.section) &&
    (value.action === undefined || value.action === "signout"),
  );
}
export function studentPortalFramePath(origin: string, slug: string, loginOrigin: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  const host = new URL(origin).hostname;
  const central = new Set([
    new URL(loginOrigin).hostname,
    getPlatformDomain(),
    `app.${getPlatformDomain()}`,
    LEGACY_PLATFORM_DOMAIN,
    `app.${LEGACY_PLATFORM_DOMAIN}`,
    "localhost",
    "127.0.0.1",
  ]);
  return (central.has(host) ? `/escolas/${slug}` : "/site") + "/portal/?connected=1";
}
