import { createFileRoute } from "@tanstack/react-router";
import { handleMobileV4Http } from "@/features/mobile-v4/http.server";

// style-check: route-exempt — API de resultados publicados autenticada Mobile V4, sem interface.
export const Route = createFileRoute("/api/mobile-v4/schools/$schoolId/results")({
  server: {
    handlers: {
      GET: ({ request }) => handleMobileV4Http(request),
      OPTIONS: ({ request }) => handleMobileV4Http(request),
    },
  },
});
