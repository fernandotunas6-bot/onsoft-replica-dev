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
  // Apenas o website institucional e a sua API de leitura são públicos.
  // /configuracoes/site continua sob AuthGate + autorização de Administrador.
  "/site",
  "/api/public/school-site",
];

export function isPublicAppPath(pathname: string) {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
