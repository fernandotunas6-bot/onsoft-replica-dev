import { createFileRoute } from "@tanstack/react-router";
import { handleMobileV4Http } from "@/features/mobile-v4/http.server";

// style-check: route-exempt — API Mobile V4 para marcar os próprios avisos como lidos, sem interface.
export const Route = createFileRoute("/api/mobile-v4/schools/$schoolId/notifications-read")({
  server: {
    handlers: {
      POST: ({ request }) => handleMobileV4Http(request),
      OPTIONS: ({ request }) => handleMobileV4Http(request),
    },
  },
});
