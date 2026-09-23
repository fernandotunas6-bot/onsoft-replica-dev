import { createFileRoute } from "@tanstack/react-router";
import { servePublicCalendarIcs } from "@/features/calendar/ics-serve";

// style-check: route-exempt - endpoint público de subscrição, sem shell administrativo.

export const Route = createFileRoute("/calendario/ics")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search["token"] === "string" ? search["token"] : "",
  }),
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = new URL(request.url).searchParams.get("token") ?? "";
        if (token.length < 16) {
          return new Response(
            `<!doctype html><html lang="pt"><meta charset="utf-8"><title>Calendário móvel · SIGA</title><body style="font-family:sans-serif;max-width:40rem;margin:3rem auto;padding:0 1.25rem;line-height:1.5"><h1>Calendário móvel</h1><p>Abra o SIGA em <a href="/calendario">/calendario</a> e use <strong>Subscrever ICS</strong> para obter o endereço do feed.</p></body></html>`,
            { headers: { "Content-Type": "text/html; charset=utf-8" } },
          );
        }
        return servePublicCalendarIcs(request);
      },
    },
  },
  component: CalendarIcsPlaceholder,
});

/**
 * Este componente não renderiza — e não é engano, é o desenho da rota.
 *
 * O `server.handlers.GET` acima responde a **todos** os pedidos: HTML fixo quando o token
 * é curto ou ausente, e o ficheiro `.ics` quando é válido. Não há caminho que chegue aqui:
 * de fora vem sempre um pedido de documento, que o handler intercepta, e de dentro da
 * aplicação ninguém navega para cá — o endereço do feed é **copiado para a área de
 * transferência** (`AppLauncher`, `TeacherWorkspacePanel`, `InstalledModuleTools`,
 * `professores/$teacherId`) para ser colado numa aplicação de calendário.
 *
 * Aqui esteve uma página completa — endereço do feed, contagem de eventos e botão de
 * descarga — que dava a impressão de estar viva. Custou tempo a alguém (a mim, a
 * 2026-09-23): tomei um `typeof window` que lá estava por um defeito de hidratação em
 * produção e anunciei-o como tal, quando o código nunca corre. Verificado antes de a
 * remover: nenhuma das variantes de pedido devolve o shell da aplicação, e não há `Link`
 * para esta rota em lado nenhum.
 *
 * Se algum dia se quiser a página de volta, o handler tem de deixar passar os pedidos que
 * aceitam HTML em vez de responder a tudo.
 */
function CalendarIcsPlaceholder() {
  return null;
}
