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
  "/api/public/school-website",
];

// Não abrir /site/* ou /api/public/school-site/* automaticamente:
// futuras rotas de edição/pré-visualização nunca devem herdar acesso anónimo.
const PUBLIC_EXACT_PATHS = new Set(["/site", "/api/public/school-site"]);

export function isPublicAppPath(pathname: string) {
  return (
    PUBLIC_EXACT_PATHS.has(pathname) ||
    PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  );
}
