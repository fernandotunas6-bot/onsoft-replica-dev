/** Widgets do template. Desligados por defeito; religar com NEXT_PUBLIC_THEME_CUSTOMIZER=true. */
export const SHOW_THEME_CUSTOMIZER = process.env.NEXT_PUBLIC_THEME_CUSTOMIZER === "true";

/** Prefixo de rotas SaaS que exigem sessão platform. */
export const PLATFORM_ROUTE_PREFIXES = [
  "/dashboard",
  "/dashboard-2",
  "/tenants",
  "/subscriptions",
  "/signups",
  "/site",
  "/platform-admins",
  "/users",
  "/audit",
  "/domains",
  "/gateway-webhooks",
  "/education-catalog",
  "/tasks",
  "/calendar",
  "/mail",
  "/chat",
  "/pricing",
  "/faqs",
  "/settings",
] as const;

export function isPlatformRoute(pathname: string): boolean {
  return PLATFORM_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
