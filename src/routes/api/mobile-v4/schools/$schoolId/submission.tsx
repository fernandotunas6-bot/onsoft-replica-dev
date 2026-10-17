import { createFileRoute } from "@tanstack/react-router";
import { handleMobileV4Http } from "@/features/mobile-v4/http.server";

// style-check: route-exempt — API Mobile V4 para registar a entrega em PDF depois do envio, sem interface.
export const Route = createFileRoute("/api/mobile-v4/schools/$schoolId/submission")({
  server: {
    handlers: {
      POST: ({ request }) => handleMobileV4Http(request),
      OPTIONS: ({ request }) => handleMobileV4Http(request),
    },
  },
});
