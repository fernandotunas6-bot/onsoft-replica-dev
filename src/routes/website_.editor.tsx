import { lazy, Suspense, type ComponentType } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { studioSearchSchema } from "@/features/school-website/studio/navigation";

const WebsiteStudio = lazy<
  ComponentType<{
    view: import("zod").infer<typeof studioSearchSchema>;
    onViewChange: (view: import("zod").infer<typeof studioSearchSchema>) => void;
  }>
>(async () => {
  // The visual editor is browser-only. Do not ship Puck/Happy DOM in the Worker bundle.
  if (import.meta.env.SSR) return { default: () => null };
  return import("@/features/school-website/studio/WebsiteStudio");
});
// style-check: route-exempt — estúdio dedicado, protegido pelo AuthGate e RouteAccessGate da raiz.
export const Route = createFileRoute("/website_/editor")({
  ssr: false,
  validateSearch: studioSearchSchema,
  head: () => ({
    meta: [
      { title: "Website Studio · SIGA Plus" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: StudioRoute,
});
function StudioRoute() {
  const view = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <Suspense
      fallback={
        <p role="status" className="p-6">
          A abrir Website Studio…
        </p>
      }
    >
      <WebsiteStudio
        view={view}
        onViewChange={(search) => {
          void navigate({ search, replace: true });
        }}
      />
    </Suspense>
  );
}
