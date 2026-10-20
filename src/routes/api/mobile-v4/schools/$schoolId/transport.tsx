import { createFileRoute } from "@tanstack/react-router";
import { handleMobileV4Http } from "@/features/mobile-v4/http.server";

// style-check: route-exempt — API Mobile V4 com as rotas de transporte do próprio aluno (paragem, horas, viatura, estado do dia), sem interface.
export const Route = createFileRoute("/api/mobile-v4/schools/$schoolId/transport")({
  server: {
    handlers: {
      GET: ({ request }) => handleMobileV4Http(request),
      OPTIONS: ({ request }) => handleMobileV4Http(request),
    },
  },
});
