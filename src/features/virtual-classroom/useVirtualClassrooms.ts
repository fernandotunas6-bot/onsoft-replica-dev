import { useCallback, useEffect, useRef, useState } from "react";
import { listVirtualClassrooms, type ScheduledClassroom } from "./classroom-api";

/** Lists only the classes the authenticated server has authorized. */
export function useVirtualClassrooms(schoolId: string | null) {
  const [sessions, setSessions] = useState<ScheduledClassroom[]>([]);
  const requestVersion = useRef(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    if (!schoolId) {
      setSessions([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await listVirtualClassrooms(schoolId);
      if (version === requestVersion.current) setSessions(result);
    } catch {
      if (version === requestVersion.current) {
        setSessions([]);
        setError("Não foi possível carregar as aulas virtuais.");
      }
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    void refresh();
    return () => { requestVersion.current += 1; };
  }, [refresh]);

  return { sessions, loading, error, refresh };
}
