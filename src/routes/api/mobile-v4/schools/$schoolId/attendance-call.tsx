import { createFileRoute } from "@tanstack/react-router";
import { handleMobileV4Http } from "@/features/mobile-v4/http.server";

// style-check: route-exempt — API Mobile V4 para registar a chamada do professor, sem interface.
export const Route = createFileRoute("/api/mobile-v4/schools/$schoolId/attendance-call")({
  server: {
    handlers: {
      POST: ({ request }) => handleMobileV4Http(request),
      OPTIONS: ({ request }) => handleMobileV4Http(request),
    },
  },
});
