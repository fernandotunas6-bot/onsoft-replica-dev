const PUBLIC_PREFIXES = ["/matricula", "/calendario/ics"];

export function isPublicAppPath(pathname: string) {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
