const PUBLIC_PREFIXES = ["/matricula", "/calendario/ics", "/criar-escola"];

export function isPublicAppPath(pathname: string) {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
