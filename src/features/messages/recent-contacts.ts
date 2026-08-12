const RECENT_KEY = (userId: string) => `siga:recent-contacts:${userId}`;
export const RECENT_CONTACT_LIMIT = 7;

export type RecentContact = { id: string; at: number };

export function readRecentContactIds(userId: string): string[] {
  if (!userId || typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY(userId));
    const parsed = raw ? (JSON.parse(raw) as RecentContact[]) : [];
    return parsed
      .filter((item) => item?.id)
      .sort((a, b) => b.at - a.at)
      .slice(0, RECENT_CONTACT_LIMIT)
      .map((item) => item.id);
  } catch {
    return [];
  }
}

export function touchRecentContact(userId: string, peerId: string) {
  if (!userId || !peerId || userId === peerId) return;
  const next = [
    { id: peerId, at: Date.now() },
    ...readRecentContactIds(userId)
      .filter((id) => id !== peerId)
      .map((id) => ({ id, at: 0 })),
  ].slice(0, RECENT_CONTACT_LIMIT);
  try {
    localStorage.setItem(RECENT_KEY(userId), JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
}

export function initialsFromName(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

export function matchesColleagueQuery(
  row: { full_name: string; cargo?: string | null },
  query: string,
) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [row.full_name, row.cargo ?? ""].some((value) => value.toLowerCase().includes(needle));
}
