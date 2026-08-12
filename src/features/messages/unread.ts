const READ_KEY = (userId: string) => `siga:dm-read:${userId}`;

export function readLastReadMap(userId: string): Record<string, string> {
  if (!userId || typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(READ_KEY(userId));
    const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function markThreadRead(userId: string, peerId: string, at = new Date().toISOString()) {
  if (!userId || !peerId || typeof window === "undefined") return;
  const next = { ...readLastReadMap(userId), [peerId]: at };
  try {
    localStorage.setItem(READ_KEY(userId), JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
}

export function hasUnreadIncoming(
  lastIncomingAt: string | null | undefined,
  lastReadAt: string | null | undefined,
) {
  if (!lastIncomingAt) return false;
  const incoming = Date.parse(lastIncomingAt);
  if (Number.isNaN(incoming)) return false;
  if (!lastReadAt) return true;
  const read = Date.parse(lastReadAt);
  if (Number.isNaN(read)) return true;
  return incoming > read;
}

export const OPEN_DM_EVENT = "siga:open-dm";

export function requestOpenDirectMessage(peerId: string) {
  if (typeof window === "undefined" || !peerId) return;
  window.dispatchEvent(new CustomEvent(OPEN_DM_EVENT, { detail: { peerId } }));
}
