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
  // Transferir a app de computador: ainda sem conta aberta no posto.
  "/transferir",
  "/api/calendar",
  "/api/catracas",
  "/api/finance",
  "/api/saas",
  "/api/public/school-website",
  "/api/public/school-content",
  "/api/public/school-blog",
];

export function isPublicAppPath(pathname: string) {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
