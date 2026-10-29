// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PersonalNotificationsList, usePersonalNotifications } from "@/features/notifications/PersonalNotificationsList";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  read: vi.fn(),
  channel: vi.fn(),
  remove: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/features/notifications/personal", () => ({
  listMyNotifications: mocks.list,
  markMyNotificationsRead: mocks.read,
}));
vi.mock("@/lib/toast", () => ({ toast: { error: mocks.toast } }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, onClick, children, className }: {
    to: string; onClick?: () => void; children: ReactNode; className?: string;
  }) => <a href={to} className={className} onClick={(e) => { e.preventDefault(); onClick?.(); }}>{children}</a>,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { channel: mocks.channel, removeChannel: mocks.remove },
}));

const idA = "00000000-0000-4000-8000-000000000001";
const idB = "00000000-0000-4000-8000-000000000002";
const initialItems = [
  { id: idA, title: "Trabalho de Matemática", body: "Novo trabalho", read: false,
    eventType: "academic.task.created", createdAt: "2026-10-29T09:00:00Z", href: "/pedagogica" },
  { id: idB, title: "Aviso da escola", body: "Mensagem completa", read: false,
    eventType: "announcement.published", createdAt: "2026-10-29T08:00:00Z", href: null },
];
let server: { items: typeof initialItems; unread: number };
let client: QueryClient;
let events: Array<() => void>;
let userId: string;
let schoolId: string;

function Panel({ open = true }: { open?: boolean }) {
  const query = usePersonalNotifications(userId, schoolId);
  return (
    <PersonalNotificationsList
      open={open}
      userId={userId}
      schoolId={schoolId}
      query={query}
      onClose={() => {}}
    />
  );
}
function mount() {
  return render(<QueryClientProvider client={client}><Panel /></QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  userId = "user-A";
  schoolId = "school-A";
  server = { items: initialItems.map((n) => ({ ...n })), unread: 2 };
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  events = [];
  const channel = {
    on: vi.fn((_event: string, _filter: unknown, cb: () => void) => {
      events.push(cb);
      return channel;
    }),
    subscribe: vi.fn(() => channel),
  };
  mocks.channel.mockReturnValue(channel);
  mocks.remove.mockResolvedValue(undefined);
  mocks.list.mockImplementation(async () => ({
    items: server.items.map((n) => ({ ...n })),
    unread: server.unread,
  }));
  mocks.read.mockImplementation(async ({ data }: { data: { ids?: string[] } }) => {
    const selected = data.ids ? new Set(data.ids) : null;
    server.items = server.items.map((n) =>
      !selected || selected.has(n.id) ? { ...n, read: true } : n,
    );
    server.unread = server.items.filter((n) => !n.read).length;
    return { ok: true };
  });
});
afterEach(() => {
  cleanup();
  client.clear();
});

describe("centro de notificações pessoais", () => {
  it("abrir o sino não limpa avisos; clicar marca imediatamente apenas esse aviso", async () => {
    mount();
    expect(await screen.findByText("Trabalho de Matemática")).toBeTruthy();
    expect(mocks.read).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Trabalho de Matemática"));
    await waitFor(() => expect(mocks.read).toHaveBeenCalledWith({ data: { ids: [idA] } }))
    await waitFor(() => expect(screen.queryByText("Trabalho de Matemática")).toBeNull());
    expect(screen.getByText("Aviso da escola")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Todas" }));
    expect(screen.getByText("Trabalho de Matemática")).toBeTruthy();
  });

  it("aviso sem destino também pode ser aberto e marcado como lido", async () => {
    mount();
    await screen.findByText("Aviso da escola");
    fireEvent.click(screen.getByText("Aviso da escola"));
    await waitFor(() => expect(mocks.read).toHaveBeenCalledWith({ data: { ids: [idB] } }))
    await waitFor(() => expect(screen.queryByText("Aviso da escola")).toBeNull());
  });

  it("marcar tudo não depende do limite de itens carregados", async () => {
    server.unread = 47;
    mount();
    await screen.findByText("Por ler (47)");
    fireEvent.click(screen.getByText("Marcar tudo como lido"));
    await waitFor(() => expect(mocks.read).toHaveBeenCalledWith({ data: {} }))
    await waitFor(() => expect(screen.getByText("Por ler (0)")).toBeTruthy());
    expect(screen.getByText("Não há notificações por ler.")).toBeTruthy();
  });

  it("se a escrita falhar, repõe a leitura do servidor e mostra erro", async () => {
    mocks.read.mockRejectedValueOnce(new Error("falha de rede"));
    mount();
    await screen.findByText("Trabalho de Matemática");
    fireEvent.click(screen.getByText("Trabalho de Matemática"));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText("Trabalho de Matemática")).toBeTruthy());
    expect(screen.getByText("Por ler (2)")).toBeTruthy();
  });

  it("eventos de inserção/actualização refrescam o sino e a lista", async () => {
    mount();
    await screen.findByText("Trabalho de Matemática");
    expect(events).toHaveLength(1);
    server.unread = 3;
    await act(async () => { events[0](); });
    await waitFor(() => expect(screen.getByText("Por ler (3)")).toBeTruthy());
  });
});
