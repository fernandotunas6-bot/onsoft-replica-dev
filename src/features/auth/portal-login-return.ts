/** Retain the chosen portal through OAuth without accepting arbitrary return destinations. */
export function portalLoginReturn(href: string): string | null {
  try {
    const current = new URL(href);
    if (
      current.pathname !== "/portal" ||
      !["https:", "http:"].includes(current.protocol) ||
      current.username ||
      current.password
    )
      return null;
    const target = new URL("/portal", current.origin);
    const school = current.searchParams.get("escola");
    if (school && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(school) && school.length <= 50)
      target.searchParams.set("escola", school);
    if (current.searchParams.get("vista") === "estudante")
      target.searchParams.set("vista", "estudante");
    return target.href;
  } catch {
    return null;
  }
}
