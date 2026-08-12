const threadKey = (userId: string, peerId: string) => {
  const pair = [userId, peerId].sort().join(":");
  return `siga:dm-thread:${pair}`;
};

export type LocalDirectMessage = {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
  mine: boolean;
};

export function readLocalThread(userId: string, peerId: string): LocalDirectMessage[] {
  if (!userId || !peerId || typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(threadKey(userId, peerId));
    const parsed = raw ? (JSON.parse(raw) as LocalDirectMessage[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function appendLocalThread(userId: string, peerId: string, message: LocalDirectMessage) {
  const next = [...readLocalThread(userId, peerId), message];
  try {
    localStorage.setItem(threadKey(userId, peerId), JSON.stringify(next.slice(-200)));
  } catch {
    /* ignore quota */
  }
  return next;
}
