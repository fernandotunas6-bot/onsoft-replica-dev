import { createFileRoute } from "@tanstack/react-router";
import { handleMobileV4Http } from "@/features/mobile-v4/http.server";

// style-check: route-exempt — API Mobile V4 para listar as entregas de trabalhos (aluno: as suas; professor: de uma tarefa sua), sem interface.
export const Route = createFileRoute("/api/mobile-v4/schools/$schoolId/submissions")({
  server: {
    handlers: {
      GET: ({ request }) => handleMobileV4Http(request),
      OPTIONS: ({ request }) => handleMobileV4Http(request),
    },
  },
});
