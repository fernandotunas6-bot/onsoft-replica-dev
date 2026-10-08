import { useCallback, useEffect, useState } from "react";
import { listVirtualClassrooms, type ScheduledClassroom } from "./classroom-api";

/** Lists only the classes the authenticated server has authorized. */
export function useVirtualClassrooms(schoolId: string | null) {
  const [sessions, setSessions] = useState<ScheduledClassroom[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!schoolId) {
      setSessions([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setSessions(await listVirtualClassrooms(schoolId));
    } catch {
      setSessions([]);
      setError("Não foi possível carregar as aulas virtuais.");
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { sessions, loading, error, refresh };
}
