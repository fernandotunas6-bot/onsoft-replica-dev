import { createFileRoute } from "@tanstack/react-router";
import { handleMobileV4Http } from "@/features/mobile-v4/http.server";

// style-check: route-exempt — API Mobile V4 para abrir o PDF de uma entrega com URL assinado de 10 minutos, sem interface.
export const Route = createFileRoute("/api/mobile-v4/schools/$schoolId/submission-file")({
  server: {
    handlers: {
      GET: ({ request }) => handleMobileV4Http(request),
      OPTIONS: ({ request }) => handleMobileV4Http(request),
    },
  },
});
