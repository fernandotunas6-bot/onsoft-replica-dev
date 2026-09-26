const PUBLIC_PREFIXES = [
  "/matricula",
  // Verificação de documentos: quem recebe um certificado não tem conta.
  "/verificar",
  "/calendario/ics",
  "/criar-escola",
  "/saas-admin",
  "/convite",
  "/auth",
  "/alterar-senha",
  "/api/calendar",
  "/api/catracas",
  "/api/finance",
  "/api/saas",
];

export function isPublicAppPath(pathname: string) {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
