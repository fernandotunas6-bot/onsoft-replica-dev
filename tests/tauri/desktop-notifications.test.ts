import { describe, expect, it, vi } from "vitest";
import {
  announcementNotice,
  appInBackground,
  createNoticeBatcher,
  isFreshAnnouncementFor,
  isIncomingMessage,
  messageNotice,
} from "@/lib/desktop-notifications";

const me = "u-1";
const now = Date.parse("2026-10-03T21:00:00Z");
const announcement = (extra: Record<string, unknown> = {}) => ({
  id: "a-1",
  title: "Reunião de pais",
  status: "sent",
  audience: "all_guardians",
  published_at: "2026-10-03T20:59:00Z",
  created_by: "secretaria-1",
  deleted_at: null,
  ...extra,
});

describe("notificações da app desktop", () => {
  it("mensagens do chat: só as escritas por outra pessoa", () => {
    expect(isIncomingMessage({ id: "m", conversation_id: "c", sender_id: "u-2" }, me)).toBe(true);
    expect(isIncomingMessage({ id: "m", conversation_id: "c", sender_id: me }, me)).toBe(false);
    expect(isIncomingMessage({ id: "m", sender_id: "u-2" }, me)).toBe(false);
    expect(isIncomingMessage(null, me)).toBe(false);
  });

  it("comunicados: a mesma regra da lista, só acabados de publicar e de outra pessoa", () => {
    const guardian = { userId: me, roles: ["Encarregado"], now };
    const teacher = { userId: me, roles: ["Professor"], now };
    expect(isFreshAnnouncementFor(announcement(), guardian)).toBe(true);
    expect(isFreshAnnouncementFor(announcement({ status: "draft" }), teacher)).toBe(false);
    expect(isFreshAnnouncementFor(announcement({ status: "scheduled" }), guardian)).toBe(false);
    expect(isFreshAnnouncementFor(announcement({ audience: "teaching_staff" }), guardian)).toBe(
      false,
    );
    expect(isFreshAnnouncementFor(announcement({ audience: "teaching_staff" }), teacher)).toBe(
      true,
    );
    expect(isFreshAnnouncementFor(announcement({ created_by: me }), teacher)).toBe(false);
    expect(isFreshAnnouncementFor(announcement({ deleted_at: "2026-10-03" }), guardian)).toBe(
      false,
    );
    // Editar um comunicado antigo não volta a avisar.
    expect(
      isFreshAnnouncementFor(announcement({ published_at: "2026-10-01T09:00:00Z" }), guardian),
    ).toBe(false);
  });

  it("textos: sem o conteúdo da mensagem; títulos longos cortados; rajadas contadas", () => {
    expect(messageNotice(1, "Ana Silva")).toEqual({
      title: "Nova mensagem",
      body: "De Ana Silva.",
    });
    expect(messageNotice(1, null).body).toBe("Abra o SIGA para a ler.");
    expect(messageNotice(3, "Ana").title).toBe("3 mensagens novas");
    expect(announcementNotice(1, "Reunião de pais")).toEqual({
      title: "Novo comunicado",
      body: "Reunião de pais",
    });
    expect(announcementNotice(1, "x".repeat(300)).body).toHaveLength(120);
    expect(announcementNotice(2, "a").title).toBe("2 comunicados novos");
  });

  it("só em segundo plano", () => {
    expect(appInBackground({ hidden: true, hasFocus: () => true })).toBe(true);
    expect(appInBackground({ hidden: false, hasFocus: () => false })).toBe(true);
    expect(appInBackground({ hidden: false, hasFocus: () => true })).toBe(false);
  });

  it("junta avisos seguidos num só, com a contagem", () => {
    vi.useFakeTimers();
    const sent: string[][] = [];
    const batcher = createNoticeBatcher<string>((items) => sent.push(items), 10_000);
    batcher.push("a");
    batcher.push("b");
    batcher.push("c");
    expect(sent).toEqual([["a"]]);
    vi.advanceTimersByTime(10_000);
    expect(sent).toEqual([["a"], ["b", "c"]]);
    vi.advanceTimersByTime(10_000);
    batcher.push("d");
    expect(sent).toEqual([["a"], ["b", "c"], ["d"]]);
    batcher.dispose();
    vi.useRealTimers();
  });
});
